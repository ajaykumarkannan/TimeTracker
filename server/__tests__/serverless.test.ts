import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

// ---------- config tests (use vi.doMock + resetModules for env isolation) ----------

describe('Serverless mode', () => {
  describe('config', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      delete process.env.SERVERLESS;
    });

    it('sets serverless=true when SERVERLESS env is "true"', async () => {
      process.env.SERVERLESS = 'true';
      const { config } = await import('../config');
      expect(config.serverless).toBe(true);
    });

    it('defaults serverless to false when SERVERLESS env is not set', async () => {
      delete process.env.SERVERLESS;
      const { config } = await import('../config');
      expect(config.serverless).toBe(false);
    });

    it('sets serverless=false for non-"true" values', async () => {
      process.env.SERVERLESS = 'yes';
      const { config } = await import('../config');
      expect(config.serverless).toBe(false);
    });

    it('validateConfig does not call process.exit in serverless mode even with errors', async () => {
      process.env.SERVERLESS = 'true';
      process.env.NODE_ENV = 'production';
      // JWT_SECRET not set — uses the default dev secret, which triggers an error

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { validateConfig } = await import('../config');
      validateConfig();

      expect(exitSpy).not.toHaveBeenCalled();

      exitSpy.mockRestore();
      errorSpy.mockRestore();
      delete process.env.NODE_ENV;
    });

    it('validateConfig calls process.exit in production non-serverless mode with errors', async () => {
      delete process.env.SERVERLESS;
      process.env.NODE_ENV = 'production';
      // JWT_SECRET defaults to dev secret which triggers an error

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { validateConfig } = await import('../config');
      validateConfig();

      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
      delete process.env.NODE_ENV;
    });
  });

  // ---------- logger tests ----------

  describe('logger', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      delete process.env.SERVERLESS;
    });

    it('creates logger with only console transport in serverless mode', async () => {
      process.env.SERVERLESS = 'true';
      const { logger } = await import('../logger');

      // Should have exactly 1 transport (Console)
      expect(logger.transports).toHaveLength(1);
      expect(logger.transports[0]).toBeInstanceOf(
        (await import('winston')).transports.Console
      );
    });

    it('creates logger with console + file transports in non-serverless mode', async () => {
      delete process.env.SERVERLESS;
      const { logger } = await import('../logger');

      // Should have 3 transports: Console + 2 File
      expect(logger.transports).toHaveLength(3);
    });
  });

  // ---------- security middleware tests ----------

  describe('security middleware (rate limit cleanup)', () => {
    it('does not start cleanup interval in serverless mode', async () => {
      vi.resetModules();

      // Track setInterval calls
      const originalSetInterval = globalThis.setInterval;
      const intervalSpy = vi.fn(originalSetInterval);
      globalThis.setInterval = intervalSpy as unknown as typeof setInterval;

      vi.doMock('../config', () => ({
        config: {
          serverless: true,
          rateLimitWindowMs: 60000,
          rateLimitMax: 100,
          nodeEnv: 'test',
        },
      }));

      // Importing the module triggers startCleanup() on module load
      await import('../middleware/security');

      // setInterval should not have been called with the 60000ms cleanup interval
      const securityIntervalCalls = intervalSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[1] === 'number' && call[1] === 60000
      );
      expect(securityIntervalCalls).toHaveLength(0);

      globalThis.setInterval = originalSetInterval;
    });
  });

  // ---------- sync route tests ----------

  describe('sync routes', () => {
    describe('broadcastSyncEvent', () => {
      afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
      });

      it('is a no-op when config.serverless is true', async () => {
        vi.doMock('../config', () => ({
          config: {
            serverless: true,
            jwtSecret: 'test-secret',
            nodeEnv: 'test',
          },
        }));
        vi.doMock('../logger', () => ({
          logger: {
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        }));
        vi.doMock('../database', () => ({
          getProvider: vi.fn(),
        }));

        const { broadcastSyncEvent } = await import('../routes/sync');

        // Should not throw and should return immediately
        expect(() => broadcastSyncEvent(1, 'time-entries')).not.toThrow();
        expect(() => broadcastSyncEvent(1, 'categories')).not.toThrow();
        expect(() => broadcastSyncEvent(1, 'all')).not.toThrow();
      });
    });

    describe('SSE endpoint', () => {
      it('returns 503 in serverless mode', async () => {
        vi.resetModules();

        vi.doMock('../config', () => ({
          config: {
            serverless: true,
            jwtSecret: 'test-secret',
            nodeEnv: 'test',
          },
        }));
        vi.doMock('../logger', () => ({
          logger: {
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        }));
        vi.doMock('../database', () => ({
          getProvider: vi.fn(),
        }));

        const syncModule = await import('../routes/sync');
        const router = syncModule.default;

        // Find the GET / route handler in the router stack
        const getRoute = (router as unknown as { stack: Array<{ route?: { path: string; methods: { get?: boolean }; stack: Array<{ handle: (...args: unknown[]) => void }> } }> }).stack.find(
          (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
        );
        expect(getRoute).toBeDefined();

        // Get the final handler (after sseAuthMiddleware) which checks serverless
        const handlers = getRoute!.route!.stack.map((s) => s.handle);
        const sseHandler = handlers[handlers.length - 1] as (req: Request, res: Response) => void;

        const mockReq = { query: {} } as unknown as Request;

        const jsonMock = vi.fn();
        const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        const mockRes = {
          status: statusMock,
          json: jsonMock,
        } as unknown as Response;

        sseHandler(mockReq, mockRes);

        expect(statusMock).toHaveBeenCalledWith(503);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Real-time sync is not available in this deployment',
            hint: 'SSE requires a persistent server process',
          })
        );
      });
    });
  });

  // ---------- api/index.ts (serverless entry point) ----------

  describe('api/index.ts serverless handler', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('initializes database and delegates to express app', async () => {
      const mockApp = vi.fn();
      const mockInitDb = vi.fn().mockResolvedValue(undefined);

      // Mock paths relative to the test file — these resolve to the same
      // modules that api/index.ts imports (../server/database, ../server/app)
      vi.doMock('../database', () => ({
        initDatabase: mockInitDb,
      }));
      vi.doMock('../app', () => ({
        default: mockApp,
      }));

      const { default: handler } = await import('../../api/index');

      const mockReq = {} as import('http').IncomingMessage;
      const mockRes = {} as import('http').ServerResponse;

      await handler(mockReq, mockRes);

      expect(mockInitDb).toHaveBeenCalledOnce();
      expect(mockApp).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('caches database initialization across invocations', async () => {
      const mockApp = vi.fn();
      const mockInitDb = vi.fn().mockResolvedValue(undefined);

      vi.doMock('../database', () => ({
        initDatabase: mockInitDb,
      }));
      vi.doMock('../app', () => ({
        default: mockApp,
      }));

      const { default: handler } = await import('../../api/index');

      const mockReq = {} as import('http').IncomingMessage;
      const mockRes = {} as import('http').ServerResponse;

      // Call handler twice
      await handler(mockReq, mockRes);
      await handler(mockReq, mockRes);

      // initDatabase should only be called once (cached)
      expect(mockInitDb).toHaveBeenCalledOnce();
      expect(mockApp).toHaveBeenCalledTimes(2);
    });

    it('retries database initialization after failure', async () => {
      const mockApp = vi.fn();
      const mockInitDb = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB connection failed'))
        .mockResolvedValueOnce(undefined);

      vi.doMock('../database', () => ({
        initDatabase: mockInitDb,
      }));
      vi.doMock('../app', () => ({
        default: mockApp,
      }));

      const { default: handler } = await import('../../api/index');

      const mockReq = {} as import('http').IncomingMessage;
      const mockRes = {} as import('http').ServerResponse;

      // First call should fail
      await expect(handler(mockReq, mockRes)).rejects.toThrow('DB connection failed');

      // Second call should succeed (dbReady reset to null on failure)
      await handler(mockReq, mockRes);

      expect(mockInitDb).toHaveBeenCalledTimes(2);
      expect(mockApp).toHaveBeenCalledOnce(); // Only the successful call
    });
  });
});
