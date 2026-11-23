import { pino, type Logger } from 'pino';

export type { Logger };

/** Structured logger. Secrets (passwords, auth headers, RFID tokens) are redacted. */
export function createLogger(service: string, level = process.env['LOG_LEVEL'] ?? 'info'): Logger {
  return pino({
    level,
    base: { service },
    redact: {
      paths: [
        'password',
        '*.password',
        'authorization',
        '*.authorization',
        'req.headers.authorization',
        'idTag',
        '*.idTag',
      ],
      censor: '[redacted]',
    },
  });
}
