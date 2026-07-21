import { logger } from '../config/logger.js';
import type { OrderClosingService } from '../services/order-closing.service.js';

export class CloseExpiredOrdersJob {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly closingService: OrderClosingService,
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
      const result = await this.closingService.closeExpiredBatch(this.batchSize);
      if (result.scanned > 0)
        logger.info({ expiredOrderClose: result }, 'expired order close batch completed');
      return result;
    } catch (error) {
      logger.error({ err: error }, 'expired order close batch failed');
      return null;
    } finally {
      this.running = false;
    }
  }
}
