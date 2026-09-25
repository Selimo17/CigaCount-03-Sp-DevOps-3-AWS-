/**
 * Minimal structured logger.
 *
 * Every log line is a single JSON object written to stdout/stderr. The ECS
 * "awslogs" driver ships these lines to CloudWatch Logs, where they can be
 * queried with Logs Insights and matched by metric filters (e.g. level=error).
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, message, fields = {}) {
  if (LEVELS[level] < configuredLevel) {
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'cigacount',
    version: process.env.APP_VERSION ?? 'dev',
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (LEVELS[level] >= LEVELS.warn) {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};
