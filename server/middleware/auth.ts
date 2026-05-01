import { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { getProvider } from '../database';
import { logger } from '../logger';
import { config } from '../config';

/** Cookie name for the refresh token */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Build cookie options for the refresh token */
export function getRefreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',  // Only sent to auth endpoints
    maxAge: maxAgeMs,
  };
}

/** Set refresh token cookie on the response */
export function setRefreshTokenCookie(res: Response, token: string, rememberMe: boolean): void {
  const maxAgeMs = getRefreshTokenExpiryMs(rememberMe);
  res.cookie(REFRESH_TOKEN_COOKIE, token, getRefreshCookieOptions(maxAgeMs));
}

/** Clear refresh token cookie */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

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
  const expiresIn = (rememberMe ? config.refreshTokenRememberMeExpiresIn : config.refreshTokenExpiresIn) as SignOptions['expiresIn'];
  return jwt.sign({ userId, email, type: 'refresh' }, config.jwtSecret, { expiresIn });
}

/** Parse a duration string like '7d', '30d', '4h' into milliseconds */
export function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)([dhms])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    case 's': return value * 1000;
    default: throw new Error(`Invalid duration unit: ${match[2]}`);
  }
}

/** Get the refresh token expiry duration in milliseconds based on rememberMe flag */
export function getRefreshTokenExpiryMs(rememberMe: boolean): number {
  const duration = rememberMe ? config.refreshTokenRememberMeExpiresIn : config.refreshTokenExpiresIn;
  return parseDurationMs(duration);
}

/**
 * Generate an access + refresh token pair and persist the refresh token.
 * Returns both tokens ready to include in an auth response.
 */
export async function createTokenPair(
  userId: number,
  email: string,
  rememberMe = false
): Promise<{ accessToken: string; refreshToken: string }> {
  const provider = getProvider();
  const accessToken = generateAccessToken(userId, email);
  const refreshToken = generateRefreshToken(userId, email, rememberMe);
  const expiresAt = new Date(Date.now() + getRefreshTokenExpiryMs(rememberMe)).toISOString();
  await provider.createRefreshToken({ user_id: userId, token: refreshToken, expires_at: expiresAt, remember_me: rememberMe });
  return { accessToken, refreshToken };
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
