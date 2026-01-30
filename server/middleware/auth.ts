import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../logger';

const JWT_SECRET = process.env.JWT_SECRET || 'chronoflow-secret-key-change-in-production';

export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
}

export interface JwtPayload {
  userId: number;
  email: string;
}

export function generateAccessToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: number, email: string): string {
  return jwt.sign({ userId, email, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

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
  next();
}
