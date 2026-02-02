import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase, shutdownDatabase } from './database';
import { logger } from './logger';
import { config, validateConfig } from './config';
import { rateLimiter, securityHeaders, sanitizeInput } from './middleware/security';
import { getCurrentVersion, LATEST_VERSION } from './migrations';
import { getDb } from './database';
import authRouter from './routes/auth';
import timeEntriesRouter from './routes/timeEntries';
import categoriesRouter from './routes/categories';
import analyticsRouter from './routes/analytics';
import exportRouter from './routes/export';
import settingsRouter from './routes/settings';
import { readFileSync } from 'fs';

// Validate configuration
validateConfig();

const app = express();

// Trust proxy for Cloudflare tunnel, nginx, etc.
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// Security headers for all requests
app.use(securityHeaders);

// Serve static files in production BEFORE rate limiting
// Static assets shouldn't count against API rate limits
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '..')));
}

// Rate limiting for API routes only
app.use(rateLimiter);

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
};
app.use(cors(corsOptions));

// Body parsing with size limit
app.use(express.json({ limit: config.maxRequestSize }));
app.use(sanitizeInput);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);

// Version endpoint
app.get('/api/version', (req, res) => {
  let appVersion = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    appVersion = pkg.version;
  } catch {
    // Use default if package.json not found
  }
  
  const db = getDb();
  const dbVersion = getCurrentVersion(db);
  
  res.json({
    app: appVersion,
    database: {
      current: dbVersion,
      latest: LATEST_VERSION,
      upToDate: dbVersion >= LATEST_VERSION
    },
    environment: config.nodeEnv
  });
});

// Health check endpoint (for Docker, load balancers, monitoring)
app.get('/api/health', (req, res) => {
  try {
    // Quick database check
    const db = getDb();
    db.exec('SELECT 1');
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({ 
      status: 'unhealthy',
      error: 'Database unavailable'
    });
  }
});

// Readiness check (for Kubernetes-style deployments)
app.get('/api/ready', (req, res) => {
  try {
    const db = getDb();
    const dbVersion = getCurrentVersion(db);
    
    if (dbVersion < LATEST_VERSION) {
      res.status(503).json({ 
        status: 'not ready',
        reason: 'Database migration pending'
      });
      return;
    }
    
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// Serve frontend for all other routes in production
if (config.nodeEnv === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
  });
}

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({ 
    error: config.nodeEnv === 'development' ? err.message : 'Internal server error'
  });
});

// Graceful shutdown handler
let server: ReturnType<typeof app.listen>;

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      shutdownDatabase();
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Initialize and start
initDatabase().then(() => {
  server = app.listen(config.port, () => {
    logger.info(`ChronoFlow server running on port ${config.port}`, {
      environment: config.nodeEnv,
      trustProxy: config.trustProxy
    });
  });
}).catch((err) => {
  logger.error('Failed to initialize database', { error: err });
  process.exit(1);
});
