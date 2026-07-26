import { Injectable } from "@nestjs/common";
import type { DatabaseClient } from "../platform/database.service";
import { DatabaseService } from "../platform/database.service";
import { ApiException } from "../platform/api.exception";
import type { LoginInput, SignupInput } from "../contracts";
import { hashPassword, verifyPassword } from "./password";
import { createSecretToken, hashSecretToken } from "./token";
import { VerificationEmailService } from "./verification-email.service";

const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type UserAuthRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  name: string;
  suspended_at: Date | null;
  deleted_at: Date | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
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
      const token = createSecretToken();
      await client.query(
        `insert into email_verification_tokens (user_id, token_hash, expires_at)
         values ($1, $2, $3)`,
        [userId, hashSecretToken(token), new Date(Date.now() + VERIFICATION_LIFETIME_MS)],
      );
      return { email: normalizedEmail, token };
    });

    if (verification) await this.email.send(verification.email, verification.token);
    return {
      requiresVerification: true as const,
      message: "If the address can be registered, a verification email is on its way.",
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
      const token = createSecretToken();
      await client.query(
        `insert into email_verification_tokens (user_id, token_hash, expires_at)
         values ($1, $2, $3)`,
        [user.id, hashSecretToken(token), new Date(Date.now() + VERIFICATION_LIFETIME_MS)],
      );
      return { email: user.email, token };
    });
    if (verification) await this.email.send(verification.email, verification.token);
    return {
      requiresVerification: true as const,
      message: "If the account needs verification, a new email is on its way.",
    };
  }

  async verifyEmail(token: string): Promise<SessionResult> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        `select id, user_id, expires_at, consumed_at
         from email_verification_tokens
         where token_hash = $1
         for update`,
        [hashSecretToken(token)],
      );
      const verification = result.rows[0];
      if (
        !verification ||
        verification.consumed_at ||
        verification.expires_at.getTime() <= Date.now()
      ) {
        throw new ApiException(
          400,
          "INVALID_VERIFICATION_TOKEN",
          "This verification link is invalid or has expired.",
        );
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
      return this.createSession(client, verification.user_id);
    });
  }

  async login(input: LoginInput): Promise<SessionResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const result = await this.database.query<UserAuthRow>(
      `select u.id, u.email, u.password_hash, u.email_verified_at,
              p.name, p.suspended_at, p.deleted_at
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
    if (user.suspended_at || user.deleted_at) {
      throw new ApiException(
        403,
        "ACCOUNT_UNAVAILABLE",
        "This account is not available.",
      );
    }
    return this.database.transaction((client) => this.createSession(client, user.id));
  }

  async authenticate(accessToken: string) {
    const result = await this.database.query<{
      session_id: string;
      user_id: string;
      email: string;
      name: string;
    }>(
      `select s.id as session_id, u.id as user_id, u.email, p.name
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
      `select u.id, u.email, p.name
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
