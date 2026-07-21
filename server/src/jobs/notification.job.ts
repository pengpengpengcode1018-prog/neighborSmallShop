import { logger } from '../config/logger.js';
import type { NotificationService } from '../services/notification.service.js';

export class NotificationJob {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly service: NotificationService,
    private readonly intervalMs: number,
    private readonly batchSize: number,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce() {
    if (this.running) return null;
    this.running = true;
    try {
      const result = await this.service.runBatch(this.batchSize);
      const hasChanges =
        result.discovered > 0 ||
        result.delivery.claimed > 0 ||
        result.delivery.skipped > 0 ||
        result.alerts.created > 0 ||
        result.alerts.reopened > 0 ||
        result.alerts.resolved > 0 ||
        result.staleUnknown > 0;
      if (hasChanges) logger.info({ notifications: result }, 'notification batch completed');
      return result;
    } catch (error) {
      logger.error({ err: error }, 'notification batch failed');
      return null;
    } finally {
      this.running = false;
    }
  }
}
