import { Queue, Worker } from "bullmq";
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getMessaging,
  type Message,
  type Messaging,
} from "firebase-admin/messaging";
import { Pool } from "pg";
import { Resend } from "resend";
import {
  isHabitScheduledOnDate,
  materializeReminders,
} from "../src/reminders/reminder-scheduler.js";
import {
  isInvalidFirebaseRegistrationError,
  summarizeFirebaseResponses,
} from "../src/reminders/firebase-delivery.js";

const database = new Pool({
  connectionString: required("DATABASE_URL"),
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl:
    process.env.DATABASE_SSL === "require"
      ? { rejectUnauthorized: false }
      : undefined,
});
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const firebaseMessaging = initializeFirebaseMessaging();
const connection = {
  url:
    process.env.NODE_ENV === "production"
      ? required("REDIS_URL")
      : process.env.REDIS_URL ?? "redis://localhost:6379",
};
const queue = new Queue("smart-habit-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
  },
});

const worker = new Worker(
  "smart-habit-jobs",
  async (job) => {
    if (job.name === "notification.deliver") {
      const rescheduleAt = await deliver(String(job.data.deliveryId));
      if (rescheduleAt) {
        await enqueueDelivery(
          String(job.data.deliveryId),
          rescheduleAt,
        );
      }
      return;
    }
    if (job.name === "announcement.deliver") {
      const result = await database.query<{ id: string; scheduled_at: Date }>(
        `select id, scheduled_at
         from notification_deliveries
         where state = 'scheduled' and scheduled_at <= now()
         order by scheduled_at
         limit 1000`,
      );
      for (const delivery of result.rows) {
        await enqueueDelivery(delivery.id, delivery.scheduled_at);
      }
      return;
    }
    if (job.name === "reminders.materialize" || job.name === "reminders.refresh") {
      await pruneInstallations();
      const deliveries = await materializeReminders(
        database,
        typeof job.data.userId === "string" ? job.data.userId : undefined,
      );
      for (const delivery of deliveries) {
        await enqueueDelivery(delivery.id, delivery.scheduled_at);
      }
    }
  },
  { connection, concurrency: 20 },
);

worker.on("completed", (job) => {
  console.info(JSON.stringify({ event: "job.completed", id: job.id, name: job.name }));
});
worker.on("failed", (job, error) => {
  console.error(JSON.stringify({ event: "job.failed", id: job?.id, message: error.message }));
});

void configureSchedulers();

async function configureSchedulers() {
  await queue.upsertJobScheduler(
    "nightly-reminder-materialization",
    { pattern: "0 2 * * *" },
    { name: "reminders.materialize", data: {} },
  );
  await queue.add(
    "reminders.materialize",
    {},
    { jobId: `reminders-startup-${Date.now()}` },
  );
}

async function enqueueDelivery(id: string, scheduledAt: Date) {
  const timestamp = new Date(scheduledAt).getTime();
  await queue.add(
    "notification.deliver",
    { deliveryId: id },
    {
      jobId: `delivery-${id}-${timestamp}`,
      delay: Math.max(0, timestamp - Date.now()),
    },
  );
}

async function deliver(id: string): Promise<Date | null> {
  const result = await database.query<{
    id: string;
    user_id: string;
    habit_id: string | null;
    channel: string;
    title: string;
    body: string;
    state: string;
    scheduled_at: Date;
    source_type: string | null;
    metadata: Record<string, unknown>;
    email: string;
  }>(
    `select d.id, d.user_id, d.habit_id, d.channel, d.title, d.body,
            d.state, d.scheduled_at, d.source_type, d.metadata, u.email
     from notification_deliveries d
     join profiles p on p.id = d.user_id
     join users u on u.id = p.id
     where d.id = $1`,
    [id],
  );
  const delivery = result.rows[0];
  if (!delivery || !["scheduled", "failed"].includes(delivery.state)) return null;
  if (delivery.scheduled_at.getTime() > Date.now() + 1000) {
    return delivery.scheduled_at;
  }

  const prepared = await prepareReminderContent(delivery);
  if (!prepared) {
    await cancelDelivery(id, "Reminder is no longer applicable.");
    return null;
  }

  try {
    if (delivery.channel === "email") {
      if (!resend) throw new Error("RESEND_API_KEY is not configured.");
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Bloom <reminders@example.com>",
        to: delivery.email,
        subject: prepared.title,
        text: prepared.body,
      });
      if (error) throw new Error(error.message);
    } else if (delivery.channel === "push") {
      const result = await deliverPush(delivery, prepared);
      if (result === "cancelled") return null;
    }
    await database.query(
      `update notification_deliveries
       set state = 'sent',
           title = $2,
           body = $3,
           sent_at = now(),
           attempt_count = attempt_count + 1,
           error_message = null
       where id = $1`,
      [id, prepared.title, prepared.body],
    );
  } catch (error) {
    await database.query(
      `update notification_deliveries
       set state = 'failed',
           attempt_count = attempt_count + 1,
           error_message = $2
       where id = $1`,
      [
        id,
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      ],
    );
    throw error;
  }
  return null;
}

async function prepareReminderContent(delivery: {
  user_id: string;
  habit_id: string | null;
  source_type: string | null;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}) {
  const localDate = String(delivery.metadata.localDate ?? "");
  if (delivery.source_type === "habit" && delivery.habit_id && localDate) {
    const completed = await database.query(
      `select 1 from habit_daily_logs
       where user_id = $1 and habit_id = $2 and local_date = $3::date
         and status = 'done'`,
      [delivery.user_id, delivery.habit_id, localDate],
    );
    if (completed.rows[0]) return null;
  }
  if (delivery.source_type === "daily_digest" && localDate) {
    const result = await database.query<{
      id: string;
      name: string;
      frequency: unknown;
      status: string | null;
    }>(
      `select h.id, h.name, h.frequency, l.status
       from habits h
       left join habit_daily_logs l
         on l.habit_id = h.id and l.local_date = $2::date
       where h.user_id = $1 and h.state = 'active' and h.deleted_at is null
       order by h.created_at`,
      [delivery.user_id, localDate],
    );
    const incomplete = result.rows.filter(
      (habit) =>
        isHabitScheduledOnDate(habit.frequency, localDate)
        && habit.status !== "done",
    );
    if (!incomplete.length) return null;
    const names = incomplete.slice(0, 3).map((habit) => habit.name).join(", ");
    const remaining = incomplete.length - 3;
    return {
      title: `${incomplete.length} habit${incomplete.length === 1 ? "" : "s"} still open`,
      body: remaining > 0 ? `${names}, and ${remaining} more.` : `${names}.`,
      url: String(delivery.metadata.url ?? "/#today"),
    };
  }
  return {
    title: delivery.title,
    body: delivery.body,
    url: String(delivery.metadata.url ?? "/"),
  };
}

async function deliverPush(
  delivery: {
    id: string;
    user_id: string;
  },
  content: { title: string; body: string; url: string },
) {
  if (!firebaseMessaging) {
    await cancelDelivery(delivery.id, "Firebase push is not configured.");
    return "cancelled" as const;
  }
  const installations = await database.query<{
    id: string;
    installation_id: string;
  }>(
    `select id, installation_id
     from firebase_installations
     where user_id = $1
       and active = true
       and last_seen_at >= now() - interval '30 days'
     order by last_seen_at desc`,
    [delivery.user_id],
  );
  if (!installations.rows.length) {
    await cancelDelivery(delivery.id, "No active Firebase installation.");
    return "cancelled" as const;
  }

  let successes = 0;
  let retryableFailures = 0;
  for (let offset = 0; offset < installations.rows.length; offset += 500) {
    const batch = installations.rows.slice(offset, offset + 500);
    const messages: Message[] = batch.map((installation) => ({
      fid: installation.installation_id,
      data: {
        title: content.title,
        body: content.body,
        url: content.url,
        deliveryId: delivery.id,
      },
    }));
    const response = await firebaseMessaging.sendEach(messages);
    const summary = summarizeFirebaseResponses(
      response.responses.map((send) => ({
        success: send.success,
        errorCode: send.error?.code ?? null,
      })),
    );
    successes += summary.successes;
    retryableFailures += summary.retryableFailures;
    for (const [index, send] of response.responses.entries()) {
      const installation = batch[index]!;
      const errorCode = send.error?.code ?? null;
      const invalid = summary.invalidIndices.includes(index)
        || isInvalidFirebaseRegistrationError(errorCode);
      await database.query(
        `insert into notification_delivery_attempts (
           delivery_id, installation_id, state, provider_message_id,
           error_code, error_message, attempted_at
         )
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (delivery_id, installation_id) do update
         set state = excluded.state,
             provider_message_id = excluded.provider_message_id,
             error_code = excluded.error_code,
             error_message = excluded.error_message,
             attempted_at = now(),
             updated_at = now()`,
        [
          delivery.id,
          installation.id,
          send.success ? "sent" : "failed",
          send.messageId ?? null,
          errorCode,
          send.error?.message.slice(0, 500) ?? null,
        ],
      );
      if (invalid) {
        await database.query(
          `update firebase_installations
           set active = false, updated_at = now()
           where id = $1`,
          [installation.id],
        );
      }
    }
  }
  if (!successes && retryableFailures) {
    throw new Error("Firebase could not deliver to any active installation.");
  }
  if (!successes) {
    await cancelDelivery(delivery.id, "Every Firebase installation is invalid.");
    return "cancelled" as const;
  }
  return "sent" as const;
}

async function cancelDelivery(id: string, reason: string) {
  await database.query(
    `update notification_deliveries
     set state = 'cancelled', error_message = $2
     where id = $1`,
    [id, reason.slice(0, 500)],
  );
}

async function pruneInstallations() {
  await database.query(
    `update firebase_installations
     set active = false, updated_at = now()
     where active = true
       and last_seen_at < now() - interval '30 days'`,
  );
}

function initializeFirebaseMessaging(): Messaging | null {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) return null;
  try {
    const account = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as ServiceAccount;
    const app = getApps()[0] ?? initializeApp({ credential: cert(account) });
    return getMessaging(app);
  } catch {
    console.error(JSON.stringify({
      event: "firebase.configuration_invalid",
      message: "Firebase service account configuration could not be loaded.",
    }));
    return null;
  }
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function shutdown() {
  await worker.close();
  await queue.close();
  await database.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
