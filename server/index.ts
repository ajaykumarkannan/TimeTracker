import app from './app';
import { initDatabase, shutdownDatabase } from './database';
import { logger } from './logger';
import { config } from './config';

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
