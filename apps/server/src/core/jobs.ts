import { Cron } from "croner";
import type { Logger } from "../logger";

/**
 * The single in-process job registry (M0.9). Every scheduled job in Caravan —
 * poll auto-close (Track A), digests (Track D), cleanup — registers here, so
 * lifecycle, error handling, and observability live in one place. No queue at
 * this scale by design (TD-2).
 */
export function createJobRegistry(logger: Logger) {
  const jobs = new Map<string, Cron>();

  return {
    register(name: string, pattern: string, fn: () => void | Promise<void>): Cron {
      if (jobs.has(name)) {
        throw new Error(`job "${name}" is already registered`);
      }
      const job = new Cron(
        pattern,
        { name, catch: (err) => logger.error({ err, job: name }, "scheduled job failed") },
        fn,
      );
      jobs.set(name, job);
      logger.debug({ job: name, pattern }, "job registered");
      return job;
    },
    list(): string[] {
      return [...jobs.keys()];
    },
    stop(): void {
      for (const job of jobs.values()) {
        job.stop();
      }
      jobs.clear();
    },
  };
}

export type JobRegistry = ReturnType<typeof createJobRegistry>;
