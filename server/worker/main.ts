import { Worker } from "bullmq";
import { Pool } from "pg";
import { Resend } from "resend";

const database = new Pool({
  connectionString: required("DATABASE_URL"),
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl:
    process.env.DATABASE_SSL === "require"
      ? { rejectUnauthorized: false }
      : undefined,
});
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const connection = {
  url:
    process.env.NODE_ENV === "production"
      ? required("REDIS_URL")
      : process.env.REDIS_URL ?? "redis://localhost:6379",
};

const worker = new Worker(
  "smart-habit-jobs",
  async (job) => {
    if (job.name === "notification.deliver") {
      await deliver(String(job.data.deliveryId));
    }
    if (job.name === "announcement.deliver") {
      const result = await database.query<{ id: string }>(
        `select id
         from notification_deliveries
         where state = 'scheduled' and scheduled_at <= now()
         order by scheduled_at
         limit 1000`,
      );
      for (const delivery of result.rows) await deliver(delivery.id);
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

async function deliver(id: string) {
  const result = await database.query<{
    id: string;
    channel: string;
    title: string;
    body: string;
    state: string;
    attempt_count: number;
    email: string;
  }>(
    `select d.id, d.channel, d.title, d.body, d.state, d.attempt_count, u.email
     from notification_deliveries d
     join profiles p on p.id = d.user_id
     join users u on u.id = p.id
     where d.id = $1`,
    [id],
  );
  const delivery = result.rows[0];
  if (!delivery || delivery.state === "sent") return;
  try {
    if (delivery.channel === "email") {
      if (!resend) throw new Error("RESEND_API_KEY is not configured.");
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Bloom <reminders@example.com>",
        to: delivery.email,
        subject: delivery.title,
        text: delivery.body,
      });
      if (error) throw new Error(error.message);
    }
    await database.query(
      `update notification_deliveries
       set state = 'sent',
           sent_at = now(),
           attempt_count = attempt_count + 1,
           error_message = null
       where id = $1`,
      [id],
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
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function shutdown() {
  await worker.close();
  await database.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
