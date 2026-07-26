import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "./auth/auth.guard";
import { DatabaseService } from "./platform/database.service";
import { QueueService } from "./platform/queue.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: QueueService,
  ) {}

  @Public()
  @Get()
  health() {
    return this.live();
  }

  @Public()
  @Get("live")
  live() {
    return {
      status: "ok",
      service: "smart-habit-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get("ready")
  async ready() {
    const [postgres, queue] = await Promise.all([
      this.withTimeout(this.database.ping()),
      this.withTimeout(this.queue.ping()),
    ]);
    if (!postgres || !queue) {
      throw new ServiceUnavailableException("Required services are not ready.");
    }
    return {
      status: "ready",
      dependencies: { postgres: "ready", queue: "ready" },
      timestamp: new Date().toISOString(),
    };
  }

  private withTimeout(check: Promise<boolean>) {
    return Promise.race([
      check,
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 2500);
      }),
    ]);
  }
}
