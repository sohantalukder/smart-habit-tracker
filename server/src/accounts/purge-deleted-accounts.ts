import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

type AvatarBucket = {
  file(path: string): {
    delete(options: { ignoreNotFound: boolean }): Promise<unknown>;
  };
};

export async function purgeDeletedAccounts(
  database: Pick<Pool, "query">,
  avatarBucket: AvatarBucket | null,
) {
  const result = await database.query<{
    id: string;
    avatar_object_path: string | null;
  }>(
    `select id, avatar_object_path
     from profiles
     where deletion_purge_at is not null
       and deletion_purge_at <= now()
     order by deletion_purge_at
     limit 100`,
  );
  const failures: Error[] = [];
  for (const profile of result.rows) {
    try {
      if (profile.avatar_object_path) {
        if (!avatarBucket) {
          throw new Error("Firebase Storage is required to purge this profile.");
        }
        await avatarBucket
          .file(profile.avatar_object_path)
          .delete({ ignoreNotFound: true });
      }
      await database.query(
        `update audit_logs
         set target_id = null, metadata = '{}'::jsonb
         where actor_id = $1 or target_id = $1`,
        [profile.id],
      );
      const deleted = await database.query(
        `delete from users u
         using profiles p
         where u.id = p.id
           and p.id = $1
           and p.deletion_purge_at <= now()
         returning u.id`,
        [profile.id],
      );
      if (deleted.rows[0]) {
        await database.query(
          `insert into audit_logs (
             actor_id, action, target_type, target_id, metadata, correlation_id
           )
           values (null, 'account.purged', 'account', null, '{}'::jsonb, $1)`,
          [randomUUID()],
        );
      }
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
      console.error(JSON.stringify({
        event: "account.purge_failed",
        profileId: profile.id,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  if (failures.length) {
    throw new Error(`${failures.length} account purge operation(s) failed.`);
  }
  return { purged: result.rows.length };
}
