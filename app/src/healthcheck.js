/**
 * Container health check used by Docker and by the ECS task definition.
 * Exits with 0 when the HTTP server answers on /api/health, 1 otherwise.
 * Written in Node.js so the runtime image needs no curl/wget.
 */
const port = process.env.PORT ?? 3000;

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(3000),
  });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
