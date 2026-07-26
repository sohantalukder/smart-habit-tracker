import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private queue: Queue | null = null;

  private instance() {
    this.queue ??= new Queue("smart-habit-jobs", {
      connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
      },
    });
    return this.queue;
  }

  add(name: string, data: Record<string, unknown>, id: string) {
    return this.instance().add(name, data, { jobId: id });
  }

  async stats() {
    if (!this.queue) return { connected: false, waiting: 0, active: 0, failed: 0 };
    const [waiting, active, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
    ]);
    return { connected: true, waiting, active, failed };
  }

  async ping() {
    if (!process.env.REDIS_URL) return false;
    try {
      await this.instance().waitUntilReady();
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
