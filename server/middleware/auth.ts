import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
  isAnonymous?: boolean;
}

export interface JwtPayload {
  userId: number;
  email: string;
}

export function generateAccessToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, config.jwtSecret, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: number, email: string): string {
  return jwt.sign({ userId, email, type: 'refresh' }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

// Get or create anonymous user by session ID
export function getOrCreateAnonymousUser(sessionId: string): number {
  const db = getDb();
  const email = `anon_${sessionId}@local`;
  
  // Check if anonymous user exists for this session
  const existing = db.exec(
    `SELECT id FROM users WHERE email = ?`,
    [email]
  );
  
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number;
  }
  
  // Create anonymous user with unique username based on session ID
  const shortId = sessionId.substring(0, 8);
  db.run(
    `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
    [email, `Guest_${shortId}`, 'anonymous-no-password']
  );
  saveDatabase();
  
  // Query for the newly created user to get the ID
  const newUser = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
  const userId = newUser[0].values[0][0] as number;
  
  // Create default categories for new user
  createDefaultCategories(userId);
  
  logger.info('Created anonymous user', { userId, sessionId });
  return userId;
}

// Create default categories for a new user
export function createDefaultCategories(userId: number) {
  const db = getDb();
  const defaults = [
    { name: 'Meetings', color: '#6366f1' },
    { name: 'Deep Work', color: '#10b981' },
    { name: 'Email & Communication', color: '#f59e0b' },
    { name: 'Planning', color: '#8b5cf6' },
    { name: 'Break', color: '#64748b' }
  ];
  
  for (const cat of defaults) {
    try {
      db.run(
        `INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
        [userId, cat.name, cat.color]
      );
    } catch {
      // Ignore if category already exists
    }
  }
  saveDatabase();
  logger.info('Created default categories', { userId });
}

// Flexible auth - allows anonymous sessions
export function flexAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const sessionId = req.headers['x-session-id'] as string;
  
  // Try JWT auth first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (payload) {
      req.userId = payload.userId;
      req.userEmail = payload.email;
      req.isAnonymous = false;
      return next();
    }
  }
  
  // Fall back to anonymous session
  if (sessionId) {
    req.userId = getOrCreateAnonymousUser(sessionId);
    req.isAnonymous = true;
    return next();
  }
  
  logger.warn('No authentication provided');
  return res.status(401).json({ error: 'Authentication required' });
}

// Strict auth - requires JWT (for auth routes)
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or invalid authorization header');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    logger.warn('Invalid or expired token');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userId = payload.userId;
  req.userEmail = payload.email;
  req.isAnonymous = false;
  next();
}
