import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { ApiException } from "../platform/api.exception";
import { hashRateLimitValue } from "./token";

type LocalEntry = { count: number; expiresAt: number };

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly redisUrl = process.env.REDIS_URL?.trim() ?? "";
  private readonly redis = this.redisUrl
    ? new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 })
    : null;
  private readonly local = new Map<string, LocalEntry>();

  async consume(
    scope: string,
    identifier: string,
    limit: number,
    windowSeconds: number,
  ) {
    const key = `auth-limit:${scope}:${hashRateLimitValue(identifier)}`;
    let count: number;
    if (this.redis) {
      if (this.redis.status === "wait") await this.redis.connect();
      count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds);
    } else {
      const now = Date.now();
      const current = this.local.get(key);
      const next =
        !current || current.expiresAt <= now
          ? { count: 1, expiresAt: now + windowSeconds * 1000 }
          : { ...current, count: current.count + 1 };
      this.local.set(key, next);
      count = next.count;
    }
    if (count > limit) {
      throw new ApiException(
        429,
        "RATE_LIMITED",
        "Too many attempts. Please wait and try again.",
        true,
      );
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }
}
