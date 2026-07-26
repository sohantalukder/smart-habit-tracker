import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../platform/database.service";
import { DatabaseService } from "../platform/database.service";
import { ApiException } from "../platform/api.exception";
import type {
  DeleteAccountInput,
  EmailChangeRequestInput,
  LoginInput,
  PasswordChangeInput,
  SignupInput,
} from "../contracts";
import { hashPassword, verifyPassword } from "./password";
import {
  createOtpCode,
  createSecretToken,
  hashOtpCode,
  hashSecretToken,
  otpMatches,
} from "./token";
import { VerificationEmailService } from "./verification-email.service";

const VERIFICATION_LIFETIME_MS = 10 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type UserAuthRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  name: string;
  suspended_at: Date | null;
  deleted_at: Date | null;
  deletion_purge_at: Date | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  onboardingCompleted: boolean;
};

export type SessionResult = {
  accessToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly email: VerificationEmailService,
  ) {}

  async signup(input: SignupInput) {
    const normalizedEmail = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const verification = await this.database.transaction(async (client) => {
      const existing = await client.query<{
        id: string;
        email: string;
        email_verified_at: Date | null;
      }>(
        "select id, email, email_verified_at from users where email = $1 for update",
        [normalizedEmail],
      );
      if (existing.rows[0]?.email_verified_at) return null;

      let userId = existing.rows[0]?.id;
      if (!userId) {
        const inserted = await client.query<{ id: string }>(
          `insert into users (email, password_hash)
           values ($1, $2)
           returning id`,
          [normalizedEmail, passwordHash],
        );
        userId = inserted.rows[0]?.id;
        if (!userId) throw new Error("User creation did not return an id.");
        await client.query(
          `insert into profiles (id, name)
           values ($1, $2)`,
          [userId, input.name.trim()],
        );
      }

      await client.query(
        `update email_verification_tokens
         set consumed_at = now()
         where user_id = $1 and consumed_at is null`,
        [userId],
      );
      const requestId = randomUUID();
      const code = createOtpCode();
      const expiresAt = new Date(Date.now() + VERIFICATION_LIFETIME_MS);
      await client.query(
        `insert into email_verification_tokens (
           id, user_id, token_hash, expires_at
         )
         values ($1, $2, $3, $4)`,
        [
          requestId,
          userId,
          hashOtpCode(requestId, "email_verification", code),
          expiresAt,
        ],
      );
      return { email: normalizedEmail, code, expiresAt };
    });

    if (verification) {
      await this.email.send(
        verification.email,
        verification.code,
        verification.expiresAt,
      );
    }
    return {
      requiresVerification: true as const,
      email: normalizedEmail,
      expiresAt: verification?.expiresAt.toISOString()
        ?? new Date(Date.now() + VERIFICATION_LIFETIME_MS).toISOString(),
      message: "If the address can be registered, a verification code is on its way.",
    };
  }

  async resendVerification(rawEmail: string) {
    const normalizedEmail = normalizeEmail(rawEmail);
    const verification = await this.database.transaction(async (client) => {
      const result = await client.query<{
        id: string;
        email: string;
        email_verified_at: Date | null;
      }>(
        "select id, email, email_verified_at from users where email = $1 for update",
        [normalizedEmail],
      );
      const user = result.rows[0];
      if (!user || user.email_verified_at) return null;
      await client.query(
        `update email_verification_tokens
         set consumed_at = now()
         where user_id = $1 and consumed_at is null`,
        [user.id],
      );
      const requestId = randomUUID();
      const code = createOtpCode();
      const expiresAt = new Date(Date.now() + VERIFICATION_LIFETIME_MS);
      await client.query(
        `insert into email_verification_tokens (
           id, user_id, token_hash, expires_at
         )
         values ($1, $2, $3, $4)`,
        [
          requestId,
          user.id,
          hashOtpCode(requestId, "email_verification", code),
          expiresAt,
        ],
      );
      return { email: user.email, code, expiresAt };
    });
    if (verification) {
      await this.email.send(
        verification.email,
        verification.code,
        verification.expiresAt,
      );
    }
    return {
      requiresVerification: true as const,
      email: normalizedEmail,
      expiresAt: verification?.expiresAt.toISOString()
        ?? new Date(Date.now() + VERIFICATION_LIFETIME_MS).toISOString(),
      message: "If the account needs verification, a new code is on its way.",
    };
  }

  async verifyEmail(rawEmail: string, code: string): Promise<SessionResult> {
    const normalizedEmail = normalizeEmail(rawEmail);
    const result = await this.database.transaction(async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string;
        token_hash: Buffer;
        expires_at: Date;
        consumed_at: Date | null;
        attempt_count: number;
        locked_at: Date | null;
      }>(
        `select t.id, t.user_id, t.token_hash, t.expires_at, t.consumed_at,
                t.attempt_count, t.locked_at
         from email_verification_tokens t
         join users u on u.id = t.user_id
         where u.email = $1
           and t.consumed_at is null
         order by t.created_at desc
         limit 1
         for update`,
        [normalizedEmail],
      );
      const verification = result.rows[0];
      if (
        !verification ||
        verification.consumed_at ||
        verification.locked_at ||
        verification.attempt_count >= MAX_VERIFICATION_ATTEMPTS ||
        verification.expires_at.getTime() <= Date.now()
      ) {
        return { kind: "invalid" as const };
      }
      const candidate = hashOtpCode(
        verification.id,
        "email_verification",
        code,
      );
      if (!otpMatches(verification.token_hash, candidate)) {
        await client.query(
          `update email_verification_tokens
           set attempt_count = least(attempt_count + 1, $2),
               last_attempt_at = now(),
               locked_at = case when attempt_count + 1 >= $2 then now() else null end
           where id = $1`,
          [verification.id, MAX_VERIFICATION_ATTEMPTS],
        );
        return { kind: "invalid" as const };
      }
      await client.query(
        "update email_verification_tokens set consumed_at = now() where id = $1",
        [verification.id],
      );
      await client.query(
        "update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1",
        [verification.user_id],
      );
      await client.query(
        `update email_verification_tokens
         set consumed_at = now()
         where user_id = $1 and consumed_at is null`,
        [verification.user_id],
      );
      return {
        kind: "success" as const,
        session: await this.createSession(client, verification.user_id),
      };
    });
    if (result.kind === "invalid") throw invalidOtp();
    return result.session;
  }

  async login(input: LoginInput): Promise<SessionResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const result = await this.database.query<UserAuthRow>(
      `select u.id, u.email, u.password_hash, u.email_verified_at,
              p.name, p.suspended_at, p.deleted_at, p.deletion_purge_at
       from users u
       join profiles p on p.id = u.id
       where u.email = $1`,
      [normalizedEmail],
    );
    const user = result.rows[0];
    const passwordMatches = user
      ? await verifyPassword(input.password, user.password_hash)
      : Boolean(await hashPassword(input.password)) && false;
    if (!user || !passwordMatches) {
      throw new ApiException(
        401,
        "INVALID_CREDENTIALS",
        "The email or password is incorrect.",
      );
    }
    if (!user.email_verified_at) {
      throw new ApiException(
        403,
        "EMAIL_NOT_VERIFIED",
        "Verify your email before signing in.",
      );
    }
    if (
      user.deleted_at &&
      user.deletion_purge_at &&
      user.deletion_purge_at.getTime() > Date.now()
    ) {
      throw new ApiException(
        403,
        "ACCOUNT_DELETION_PENDING",
        "This account is scheduled for deletion. Restore it to continue.",
        false,
        undefined,
        { purgeAt: user.deletion_purge_at.toISOString() },
      );
    }
    if (user.suspended_at || user.deleted_at) {
      throw new ApiException(
        403,
        "ACCOUNT_UNAVAILABLE",
        "This account is not available.",
      );
    }
    return this.database.transaction((client) => this.createSession(client, user.id));
  }

  async restoreAccount(input: LoginInput): Promise<SessionResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const result = await this.database.query<UserAuthRow>(
      `select u.id, u.email, u.password_hash, u.email_verified_at,
              p.name, p.suspended_at, p.deleted_at, p.deletion_purge_at
       from users u
       join profiles p on p.id = u.id
       where u.email = $1`,
      [normalizedEmail],
    );
    const user = result.rows[0];
    const passwordMatches = user
      ? await verifyPassword(input.password, user.password_hash)
      : Boolean(await hashPassword(input.password)) && false;
    if (
      !user ||
      !passwordMatches ||
      !user.email_verified_at ||
      user.suspended_at ||
      !user.deleted_at ||
      !user.deletion_purge_at ||
      user.deletion_purge_at.getTime() <= Date.now()
    ) {
      throw new ApiException(
        401,
        "ACCOUNT_NOT_RESTORABLE",
        "The account could not be restored with these credentials.",
      );
    }

    const session = await this.database.transaction(async (client) => {
      const restored = await client.query(
        `update profiles
         set deleted_at = null,
             deletion_purge_at = null,
             updated_at = now()
         where id = $1
           and deleted_at is not null
           and deletion_purge_at > now()
         returning id`,
        [user.id],
      );
      if (!restored.rows[0]) {
        throw new ApiException(
          409,
          "ACCOUNT_NOT_RESTORABLE",
          "The account recovery window has ended.",
        );
      }
      return this.createSession(client, user.id);
    });
    await this.email.sendSecurityNotice(
      user.email,
      "Your Bloom account was restored",
      "Your Bloom account deletion was cancelled and access has been restored. Push notifications remain disabled until you enable them again.",
    );
    return session;
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: PasswordChangeInput,
  ) {
    const result = await this.database.query<{
      email: string;
      password_hash: string;
    }>(
      "select email, password_hash from users where id = $1",
      [userId],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(input.currentPassword, user.password_hash))) {
      throw new ApiException(
        401,
        "CURRENT_PASSWORD_INCORRECT",
        "The current password is incorrect.",
      );
    }
    if (await verifyPassword(input.newPassword, user.password_hash)) {
      throw new ApiException(
        400,
        "PASSWORD_REUSED",
        "Choose a password you have not just used.",
        false,
        { newPassword: ["Choose a password you have not just used."] },
      );
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.database.transaction(async (client) => {
      await client.query(
        "update users set password_hash = $2, updated_at = now() where id = $1",
        [userId, passwordHash],
      );
      await client.query(
        `update user_sessions
         set revoked_at = now()
         where user_id = $1 and id <> $2 and revoked_at is null`,
        [userId, currentSessionId],
      );
    });
    await this.email.sendSecurityNotice(
      user.email,
      "Your Bloom password was changed",
      "Your Bloom password was changed and other signed-in devices were disconnected. If this was not you, contact support immediately.",
    );
    return { changed: true as const };
  }

  async requestEmailChange(userId: string, input: EmailChangeRequestInput) {
    const normalizedEmail = normalizeEmail(input.newEmail);
    const result = await this.database.query<{
      email: string;
      password_hash: string;
    }>(
      "select email, password_hash from users where id = $1",
      [userId],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(input.currentPassword, user.password_hash))) {
      throw new ApiException(
        401,
        "CURRENT_PASSWORD_INCORRECT",
        "The current password is incorrect.",
      );
    }
    if (normalizedEmail === user.email) {
      throw new ApiException(
        400,
        "EMAIL_UNCHANGED",
        "Enter a different email address.",
        false,
        { newEmail: ["Enter a different email address."] },
      );
    }

    const requestId = randomUUID();
    const code = createOtpCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_LIFETIME_MS);
    try {
      await this.database.transaction(async (client) => {
        const existing = await client.query(
          "select 1 from users where email = $1 and id <> $2",
          [normalizedEmail, userId],
        );
        if (existing.rows[0]) {
          throw new ApiException(
            409,
            "EMAIL_ALREADY_IN_USE",
            "That email address is already in use.",
            false,
            { newEmail: ["That email address is already in use."] },
          );
        }
        await client.query(
          `update email_change_tokens
           set consumed_at = now()
           where user_id = $1 and consumed_at is null`,
          [userId],
        );
        await client.query(
          `insert into email_change_tokens (
             id, user_id, pending_email, token_hash, expires_at
           )
           values ($1, $2, $3, $4, $5)`,
          [
            requestId,
            userId,
            normalizedEmail,
            hashOtpCode(requestId, "email_change", code),
            expiresAt,
          ],
        );
      });
      await this.email.sendEmailChangeVerification(
        normalizedEmail,
        code,
        expiresAt,
      );
    } catch (error) {
      if (error instanceof ApiException) throw error;
      if (isUniqueViolation(error)) {
        throw new ApiException(
          409,
          "EMAIL_ALREADY_IN_USE",
          "That email address is already in use.",
          false,
          { newEmail: ["That email address is already in use."] },
        );
      }
      throw error;
    }
    await this.email.sendSecurityNotice(
      user.email,
      "A Bloom email change was requested",
      `A request was made to change your Bloom sign-in email to ${normalizedEmail}. Your current email remains active until the new address is verified.`,
    );
    return {
      verificationRequired: true as const,
      pendingEmail: normalizedEmail,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyEmailChange(userId: string, code: string): Promise<SessionResult> {
    const result = await this.database.transaction(async (client) => {
      const tokenResult = await client.query<{
        id: string;
        user_id: string;
        pending_email: string;
        token_hash: Buffer;
        expires_at: Date;
        consumed_at: Date | null;
        attempt_count: number;
        locked_at: Date | null;
        current_email: string;
      }>(
        `select t.id, t.user_id, t.pending_email, t.token_hash, t.expires_at,
                t.consumed_at, t.attempt_count, t.locked_at,
                u.email as current_email
         from email_change_tokens t
         join users u on u.id = t.user_id
         join profiles p on p.id = t.user_id
         where t.user_id = $1
           and t.consumed_at is null
           and p.deleted_at is null
           and p.suspended_at is null
         order by t.created_at desc
         limit 1
         for update`,
        [userId],
      );
      const verification = tokenResult.rows[0];
      if (
        !verification ||
        verification.consumed_at ||
        verification.locked_at ||
        verification.attempt_count >= MAX_VERIFICATION_ATTEMPTS ||
        verification.expires_at.getTime() <= Date.now()
      ) {
        return {
          kind: "invalid" as const,
        };
      }
      const candidate = hashOtpCode(verification.id, "email_change", code);
      if (!otpMatches(verification.token_hash, candidate)) {
        await client.query(
          `update email_change_tokens
           set attempt_count = least(attempt_count + 1, $2),
               last_attempt_at = now(),
               locked_at = case when attempt_count + 1 >= $2 then now() else null end
           where id = $1`,
          [verification.id, MAX_VERIFICATION_ATTEMPTS],
        );
        return {
          kind: "invalid" as const,
        };
      }
      const existing = await client.query(
        "select 1 from users where email = $1 and id <> $2",
        [verification.pending_email, verification.user_id],
      );
      if (existing.rows[0]) {
        throw new ApiException(
          409,
          "EMAIL_ALREADY_IN_USE",
          "That email address is already in use.",
        );
      }
      await client.query(
        `update users
         set email = $2, email_verified_at = now(), updated_at = now()
         where id = $1`,
        [verification.user_id, verification.pending_email],
      );
      await client.query(
        `update email_change_tokens
         set consumed_at = now()
         where user_id = $1 and consumed_at is null`,
        [verification.user_id],
      );
      await client.query(
        `update user_sessions
         set revoked_at = now()
         where user_id = $1 and revoked_at is null`,
        [verification.user_id],
      );
      const session = await this.createSession(client, verification.user_id);
      return {
        kind: "success" as const,
        session,
        oldEmail: verification.current_email,
        newEmail: verification.pending_email,
      };
    }).catch((error) => {
      if (isUniqueViolation(error)) {
        throw new ApiException(
          409,
          "EMAIL_ALREADY_IN_USE",
          "That email address is already in use.",
        );
      }
      throw error;
    });
    if (result.kind === "invalid") throw invalidOtp();
    await Promise.all([
      this.email.sendSecurityNotice(
        result.oldEmail,
        "Your Bloom email was changed",
        `Your Bloom sign-in email was changed to ${result.newEmail}. If this was not you, contact support immediately.`,
      ),
      this.email.sendSecurityNotice(
        result.newEmail,
        "Your new Bloom email is active",
        "This address is now the sign-in email for your Bloom account.",
      ),
    ]);
    return result.session;
  }

  async signOutOtherSessions(userId: string, currentSessionId: string) {
    const result = await this.database.query(
      `update user_sessions
       set revoked_at = now()
       where user_id = $1 and id <> $2 and revoked_at is null`,
      [userId, currentSessionId],
    );
    return { signedOut: result.rowCount ?? 0 };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const result = await this.database.query<{
      id: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `select id,created_at,expires_at from user_sessions
       where user_id=$1 and revoked_at is null and expires_at > now()
       order by created_at desc`,
      [userId],
    );
    return result.rows.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
    }));
  }

  async deleteAccount(userId: string, input: DeleteAccountInput) {
    const result = await this.database.query<{
      email: string;
      password_hash: string;
    }>(
      "select email, password_hash from users where id = $1",
      [userId],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(input.currentPassword, user.password_hash))) {
      throw new ApiException(
        401,
        "CURRENT_PASSWORD_INCORRECT",
        "The current password is incorrect.",
      );
    }
    const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.database.transaction(async (client) => {
      await client.query(
        `update profiles
         set deleted_at = now(),
             deletion_purge_at = $2,
             updated_at = now()
         where id = $1`,
        [userId, purgeAt],
      );
      await client.query(
        `update user_sessions
         set revoked_at = now()
         where user_id = $1 and revoked_at is null`,
        [userId],
      );
      await client.query(
        `update firebase_installations
         set active = false, updated_at = now()
         where user_id = $1 and active = true`,
        [userId],
      );
      await client.query(
        `update notification_deliveries
         set state = 'cancelled',
             error_message = 'Account deletion requested.'
         where user_id = $1 and state in ('scheduled', 'failed')`,
        [userId],
      );
    });
    await this.email.sendSecurityNotice(
      user.email,
      "Your Bloom account is scheduled for deletion",
      `Your Bloom account is disabled and will be permanently deleted on ${purgeAt.toISOString()}. Sign in before then to restore it.`,
    );
    return { deletionScheduled: true as const, purgeAt: purgeAt.toISOString() };
  }

  async authenticate(accessToken: string) {
    const result = await this.database.query<{
      session_id: string;
      user_id: string;
      email: string;
      name: string;
      onboarding_completed_at: Date | null;
    }>(
      `select s.id as session_id, u.id as user_id, u.email, p.name,
              p.onboarding_completed_at
       from user_sessions s
       join users u on u.id = s.user_id
       join profiles p on p.id = u.id
       where s.token_hash = $1
         and s.revoked_at is null
         and s.expires_at > now()
         and u.email_verified_at is not null
         and p.suspended_at is null
         and p.deleted_at is null`,
      [hashSecretToken(accessToken)],
    );
    const session = result.rows[0];
    if (!session) {
      throw new ApiException(
        401,
        "SESSION_INVALID",
        "Your session has expired. Please sign in again.",
      );
    }
    return {
      sessionId: session.session_id,
      user: {
        id: session.user_id,
        email: session.email,
        name: session.name,
        onboardingCompleted: Boolean(session.onboarding_completed_at),
      },
    };
  }

  async logout(sessionId: string) {
    await this.database.query(
      "update user_sessions set revoked_at = now() where id = $1 and revoked_at is null",
      [sessionId],
    );
    return { loggedOut: true as const };
  }

  private async createSession(
    client: DatabaseClient,
    userId: string,
  ): Promise<SessionResult> {
    const accessToken = createSecretToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await client.query(
      `insert into user_sessions (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [userId, hashSecretToken(accessToken), expiresAt],
    );
    const result = await client.query<AuthenticatedUser>(
      `select u.id, u.email, p.name,
              (p.onboarding_completed_at is not null) as "onboardingCompleted"
       from users u
       join profiles p on p.id = u.id
       where u.id = $1`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw new Error("Session user was not found.");
    return { accessToken, expiresAt: expiresAt.toISOString(), user };
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

function invalidOtp() {
  return new ApiException(
    400,
    "INVALID_VERIFICATION_CODE",
    "The verification code is invalid, expired, or has too many failed attempts.",
    false,
    { code: ["Enter the newest six-digit code sent to your email."] },
  );
}
