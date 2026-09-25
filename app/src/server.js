import { createApp } from './app.js';
import { logger } from './logger.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

const server = app.listen(port, () => {
  logger.info('server_started', { port });
});

// ECS sends SIGTERM before stopping a task: stop accepting new connections
// and let in-flight requests finish so deployments cause no errors.
function shutdown(signal) {
  logger.info('shutdown_requested', { signal });
  server.close(() => {
    logger.info('server_stopped');
    process.exit(0);
  });
  // Force exit if connections do not drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { error: String(reason) });
});
