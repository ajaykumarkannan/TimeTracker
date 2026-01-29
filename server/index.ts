import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase } from './database';
import { logger } from './logger';
import timeEntriesRouter from './routes/timeEntries';
import categoriesRouter from './routes/categories';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { body: req.body });
  next();
});

// Routes
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/categories', categoriesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database then start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  logger.error('Failed to initialize database', { error: err });
  process.exit(1);
});
