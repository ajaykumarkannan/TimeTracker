import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

// Rate limiting store (in-memory, resets on restart)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Track cleanup interval for proper shutdown
let cleanupInterval: NodeJS.Timeout | null = null;

// Start cleanup interval
function startCleanup(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Clean every minute
  
  // Don't prevent process exit
  cleanupInterval.unref();
}

// Stop cleanup interval (for graceful shutdown)
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Initialize cleanup on module load
startCleanup();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Get client IP (supports proxy)
  const ip = (req.ip || req.socket.remoteAddress || 'unknown') as string;
  const now = Date.now();
  
  let record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + config.rateLimitWindowMs };
    rateLimitStore.set(ip, record);
  } else {
    record.count++;
  }
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', config.rateLimitMax);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimitMax - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
  
  if (record.count > config.rateLimitMax) {
    res.status(429).json({ 
      error: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
    return;
  }
  
  next();
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  
  // HSTS in production (tells browsers to always use HTTPS)
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  next();
}

// Input sanitization middleware
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Recursively sanitize strings in body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove null bytes and trim
      result[key] = value.replace(/\0/g, '').trim();
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'object' && item !== null 
          ? sanitizeObject(item as Record<string, unknown>) 
          : typeof item === 'string' 
            ? item.replace(/\0/g, '').trim() 
            : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
