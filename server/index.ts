import express from 'express';
import cors from 'cors';
import { initDatabase } from './database';
import { logger } from './logger';
import timeEntriesRouter from './routes/timeEntries';
import categoriesRouter from './routes/categories';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { body: req.body });
  next();
});

// Initialize database
initDatabase();

// Routes
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/categories', categoriesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
