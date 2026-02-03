import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock config before importing security module
vi.mock('../config', () => ({
  config: {
    rateLimitWindowMs: 60000,
    rateLimitMax: 5,
    nodeEnv: 'development'
  }
}));

import { rateLimiter, securityHeaders, sanitizeInput, stopRateLimitCleanup } from '../middleware/security';
import { config } from '../config';

describe('Security Middleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('stopRateLimitCleanup', () => {
    it('can be called without error', () => {
      expect(() => stopRateLimitCleanup()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      expect(() => {
        stopRateLimitCleanup();
        stopRateLimitCleanup();
      }).not.toThrow();
    });
  });

  describe('rateLimiter', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let setHeaderMock: ReturnType<typeof vi.fn>;
    let statusMock: ReturnType<typeof vi.fn>;
    let jsonMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      setHeaderMock = vi.fn();
      jsonMock = vi.fn();
      statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      
      mockReq = {
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' } as unknown as Request['socket']
      };
      mockRes = {
        setHeader: setHeaderMock,
        status: statusMock,
        json: jsonMock
      };
      mockNext = vi.fn();
    });

    it('allows requests under the limit', () => {
      // Use unique IP for this test
      mockReq.ip = '192.168.1.1';
      
      rateLimiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    });

    it('sets rate limit headers', () => {
      mockReq.ip = '192.168.1.2';
      
      rateLimiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('blocks requests over the limit', () => {
      mockReq.ip = '192.168.1.3';
      
      // Make 6 requests (limit is 5)
      for (let i = 0; i < 6; i++) {
        mockNext = vi.fn();
        rateLimiter(mockReq as Request, mockRes as Response, mockNext);
      }
      
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Too many requests'
      }));
    });

    it('handles missing IP gracefully', () => {
      mockReq = {
        ip: undefined,
        socket: { remoteAddress: undefined } as unknown as Request['socket']
      };
      
      rateLimiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('uses socket remoteAddress when ip is not available', () => {
      mockReq = {
        ip: undefined,
        socket: { remoteAddress: '10.0.0.1' } as unknown as Request['socket']
      };
      
      rateLimiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    });
  });

  describe('securityHeaders', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let setHeaderMock: ReturnType<typeof vi.fn>;
    let removeHeaderMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      setHeaderMock = vi.fn();
      removeHeaderMock = vi.fn();
      
      mockReq = {};
      mockRes = {
        setHeader: setHeaderMock,
        removeHeader: removeHeaderMock
      };
      mockNext = vi.fn();
    });

    it('sets security headers', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);
      
      expect(setHeaderMock).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(setHeaderMock).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(setHeaderMock).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(removeHeaderMock).toHaveBeenCalledWith('X-Powered-By');
      expect(mockNext).toHaveBeenCalled();
    });

    it('sets Content-Security-Policy', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);
      
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
    });

    it('sets HSTS header in production', () => {
      // Change to production mode
      vi.mocked(config).nodeEnv = 'production';
      
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);
      
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
      
      // Reset to development
      vi.mocked(config).nodeEnv = 'development';
    });

    it('does not set HSTS header in development', () => {
      vi.mocked(config).nodeEnv = 'development';
      
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);
      
      // HSTS should not be set
      const hstsCall = setHeaderMock.mock.calls.find(
        (call: unknown[]) => call[0] === 'Strict-Transport-Security'
      );
      expect(hstsCall).toBeUndefined();
    });
  });

  describe('sanitizeInput', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = { body: {} };
      mockRes = {};
      mockNext = vi.fn();
    });

    it('removes null bytes from strings', () => {
      mockReq.body = { name: 'test\0value' };
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.name).toBe('testvalue');
      expect(mockNext).toHaveBeenCalled();
    });

    it('trims whitespace from strings', () => {
      mockReq.body = { name: '  test  ' };
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.name).toBe('test');
    });

    it('handles nested objects', () => {
      mockReq.body = { 
        user: { 
          name: '  nested\0test  ' 
        } 
      };
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.user.name).toBe('nestedtest');
    });

    it('handles arrays', () => {
      mockReq.body = { 
        items: ['  item1  ', 'item2\0'] 
      };
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.items).toEqual(['item1', 'item2']);
    });

    it('preserves non-string values', () => {
      mockReq.body = { 
        count: 42,
        active: true,
        data: null
      };
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.count).toBe(42);
      expect(mockReq.body.active).toBe(true);
      expect(mockReq.body.data).toBe(null);
    });

    it('handles arrays with nested objects', () => {
      mockReq.body = { 
        items: [
          { name: '  nested\0item  ', value: 123 },
          { name: 'clean', value: 456 }
        ]
      };
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockReq.body.items[0].name).toBe('nesteditem');
      expect(mockReq.body.items[0].value).toBe(123);
      expect(mockReq.body.items[1].name).toBe('clean');
    });

    it('handles empty body', () => {
      mockReq.body = undefined;
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('handles non-object body', () => {
      mockReq.body = 'string body';
      
      sanitizeInput(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body).toBe('string body');
    });
  });
});
