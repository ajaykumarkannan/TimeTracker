import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { logger } from './logger';
import { config, validateConfig } from './config';
import { rateLimiter, securityHeaders, sanitizeInput } from './middleware/security';
import authRouter from './routes/auth';
import timeEntriesRouter from './routes/timeEntries';
import categoriesRouter from './routes/categories';
import analyticsRouter from './routes/analytics';
import exportRouter from './routes/export';
import settingsRouter from './routes/settings';
import syncRouter from './routes/sync';
import { version as APP_VERSION } from '../package.json';
import { getProvider } from './database';

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
// (Skipped in serverless — the platform serves static files directly)
if (config.nodeEnv === 'production' && !config.serverless) {
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
app.use(cookieParser());
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
app.use('/api/sync', syncRouter);

// Version endpoint
app.get('/api/version', async (req, res) => {
  const provider = getProvider();
  const dbVersion = await provider.getCurrentVersion();
  const latestVersion = await provider.getLatestVersion();
  
  res.json({
    app: APP_VERSION,
    database: {
      current: dbVersion,
      latest: latestVersion,
      upToDate: dbVersion >= latestVersion
    },
    environment: config.nodeEnv,
    serverless: config.serverless
  });
});

// Health check endpoint (for Docker, load balancers, monitoring)
app.get('/api/health', async (req, res) => {
  try {
    const provider = getProvider();
    await provider.getCurrentVersion();
    
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
app.get('/api/ready', async (req, res) => {
  try {
    const provider = getProvider();
    const dbVersion = await provider.getCurrentVersion();
    const latestVersion = await provider.getLatestVersion();
    
    if (dbVersion < latestVersion) {
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
// (Skipped in serverless — the platform handles static file routing)
if (config.nodeEnv === 'production' && !config.serverless) {
  app.get('*', (req, res) => {
    // index.html should never be cached — Vite already hashes JS/CSS assets
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

export default app;
