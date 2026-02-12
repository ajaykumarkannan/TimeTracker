import { Router, Response, Request } from 'express';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getDb } from '../database';

const router = Router();

// Store connected clients by user ID
interface SSEClient {
  res: Response;
  userId: number;
  lastEventId: number;
}

const clients: Map<string, SSEClient> = new Map();
let eventCounter = 0;

// Generate unique client ID
function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Broadcast sync event to all clients for a specific user
export function broadcastSyncEvent(userId: number, type: 'time-entries' | 'categories' | 'all') {
  const timestamp = Date.now();
  eventCounter++;
  
  let clientCount = 0;
  clients.forEach((client, clientId) => {
    if (client.userId === userId) {
      try {
        client.res.write(`id: ${eventCounter}\n`);
        client.res.write(`event: sync\n`);
        client.res.write(`data: ${JSON.stringify({ type, timestamp })}\n\n`);
        client.lastEventId = eventCounter;
        clientCount++;
      } catch {
        // Client disconnected, remove from map
        clients.delete(clientId);
        logger.debug('Removed disconnected SSE client', { clientId, userId });
      }
    }
  });
  
  if (clientCount > 0) {
    logger.debug('Broadcast sync event', { userId, type, clientCount });
  }
}

// Custom auth middleware for SSE that supports query params
function sseAuthMiddleware(req: Request, res: Response, next: () => void) {
  const token = req.query.token as string;
  const sessionId = req.query.sessionId as string;
  
  if (token) {
    // JWT auth
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
      (req as AuthRequest).userId = decoded.userId;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else if (sessionId) {
    // Session auth - look up user by session
    const db = getDb();
    const guestEmail = `anon_${sessionId}@local`;
    const result = db.exec(
      `SELECT id FROM users WHERE email = ?`,
      [guestEmail]
    );
    
    if (result.length > 0 && result[0].values.length > 0) {
      (req as AuthRequest).userId = result[0].values[0][0] as number;
      return next();
    }
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  return res.status(401).json({ error: 'Authentication required' });
}

// SSE endpoint - requires auth via query params
router.get('/', sseAuthMiddleware, (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId as number;
  const clientId = generateClientId();
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
  
  // Send initial connection event
  res.write(`id: ${eventCounter}\n`);
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`);
  
  // Store client
  clients.set(clientId, { res, userId, lastEventId: eventCounter });
  logger.info('SSE client connected', { clientId, userId, totalClients: clients.size });
  
  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeatInterval);
    }
  }, 30000);
  
  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    clients.delete(clientId);
    logger.info('SSE client disconnected', { clientId, userId, totalClients: clients.size });
  });
});

// Get connection status (for debugging/monitoring)
router.get('/status', flexAuthMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.userId as number;
  let userClientCount = 0;
  
  clients.forEach(client => {
    if (client.userId === userId) {
      userClientCount++;
    }
  });
  
  res.json({
    totalClients: clients.size,
    userClients: userClientCount,
    eventCounter
  });
});

export default router;
