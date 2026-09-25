import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { logger } from './logger.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, '..', 'public');

/**
 * Logs one JSON line per HTTP request (method, path, status, duration).
 * Health checks are logged at debug level to avoid flooding CloudWatch.
 */
function accessLog(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const fields = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userAgent: req.get('user-agent'),
    };
    if (req.path === '/api/health') {
      logger.debug('http_request', fields);
    } else if (res.statusCode >= 500) {
      logger.error('http_request', fields);
    } else {
      logger.info('http_request', fields);
    }
  });
  next();
}

export function createApp({ version = process.env.APP_VERSION ?? 'dev' } = {}) {
  const app = express();
  const startedAt = Date.now();

  // The app runs behind an AWS Application Load Balancer.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // The ALB listener may be plain HTTP when no certificate is configured.
          upgradeInsecureRequests: null,
        },
      },
      // HSTS only makes sense once HTTPS is enabled on the load balancer.
      strictTransportSecurity: false,
    }),
  );
  app.use(accessLog);

  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  app.get('/api/version', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ version });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Static assets are not fingerprinted, so browsers must revalidate them
  // (cheap thanks to ETags) to always get the latest deployed version.
  app.use(
    express.static(publicDir, {
      etag: true,
      lastModified: true,
      setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
    }),
  );

  // Single page application: unknown routes fall back to index.html.
  app.get('/{*splat}', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Centralized error handler: log with stack trace, hide details from clients.
  // Express recognizes an error handler by its four parameters, so "next" is
  // kept even though it is not used.
  app.use((err, req, res, next) => {
    logger.error('unhandled_error', {
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
