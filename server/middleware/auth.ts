import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { getProvider } from '../database';
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
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign({ userId, email }, config.jwtSecret, options);
}

export function generateRefreshToken(userId: number, email: string, rememberMe?: boolean): string {
  const expiresIn = rememberMe ? '30d' : '7d';
  return jwt.sign({ userId, email, type: 'refresh' }, config.jwtSecret, { expiresIn });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

// Get or create anonymous user by session ID
export async function getOrCreateAnonymousUser(sessionId: string): Promise<number> {
  const provider = getProvider();
  const email = `anon_${sessionId}@local`;
  const existing = await provider.findUserByEmail(email);
  if (existing) {
    return existing.id;
  }

  const user = await provider.createAnonymousUser(sessionId);
  await provider.createDefaultCategories(user.id);
  logger.info('Created anonymous user', { userId: user.id, sessionId });
  return user.id;
}

// Create default categories for a new user
export async function createDefaultCategories(userId: number) {
  const provider = getProvider();
  await provider.createDefaultCategories(userId);
}

// Flexible auth - allows anonymous sessions
export async function flexAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
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
    req.userId = await getOrCreateAnonymousUser(sessionId);
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
