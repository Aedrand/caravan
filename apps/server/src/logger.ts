import pino from "pino";
import type { Config } from "./config";

/**
 * JSON to stdout in production (operators pipe it wherever — TD-2);
 * pretty-printed in dev. The pretty transport is dev-only on purpose:
 * pino worker-thread transports don't survive bundling, plain JSON does.
 */
export function createLogger(config: Pick<Config, "logLevel" | "isDev">) {
  return pino({
    level: config.logLevel,
    ...(config.isDev && {
      transport: { target: "pino-pretty", options: { colorize: true } },
    }),
  });
}

export type Logger = ReturnType<typeof createLogger>;
