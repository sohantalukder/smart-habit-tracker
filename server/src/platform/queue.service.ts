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
    try {
      const queue = this.instance();
      await queue.waitUntilReady();
      const [waiting, active, failed, workers] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
        queue.getWorkers(),
      ]);
      return {
        connected: true,
        workerConnected: workers.length > 0,
        workers: workers.length,
        waiting,
        active,
        failed,
      };
    } catch {
      return {
        connected: false,
        workerConnected: false,
        workers: 0,
        waiting: 0,
        active: 0,
        failed: 0,
      };
    }
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
