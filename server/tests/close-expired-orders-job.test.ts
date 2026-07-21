import { describe, expect, it, vi } from 'vitest';

import { CloseExpiredOrdersJob } from '../src/jobs/close-expired-orders.job.js';
import type { OrderClosingService } from '../src/services/order-closing.service.js';

describe('expired order close job', () => {
  it('does not overlap batches inside one process', async () => {
    let release!: (value: {
      scanned: number;
      closed: number;
      paid: number;
      deferred: number;
    }) => void;
    const pending = new Promise<{
      scanned: number;
      closed: number;
      paid: number;
      deferred: number;
    }>((resolve) => {
      release = resolve;
    });
    const closeExpiredBatch = vi.fn(() => pending);
    const service = { closeExpiredBatch } as unknown as OrderClosingService;
    const job = new CloseExpiredOrdersJob(service, 30_000, 50);

    const first = job.runOnce();
    await expect(job.runOnce()).resolves.toBeNull();
    release({ scanned: 1, closed: 1, paid: 0, deferred: 0 });
    await expect(first).resolves.toEqual({ scanned: 1, closed: 1, paid: 0, deferred: 0 });
    expect(closeExpiredBatch).toHaveBeenCalledTimes(1);
  });
});
