// Centralized configuration with environment variable support
// All config values have sensible defaults for development

// Default ports: dev=4847, prod=4849 (consecutive unique ports to avoid collisions)
const DEFAULT_DEV_PORT = 4847;
const DEFAULT_PROD_PORT = 4849;

const getDefaultPort = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'production' ? DEFAULT_PROD_PORT : DEFAULT_DEV_PORT;
};

export const config = {
  // Server
  port: parseInt(process.env.PORT || String(getDefaultPort()), 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  dbPath: process.env.DB_PATH || './data/timetracker.db',
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  
  // CORS - comma-separated origins or * for all
  corsOrigin: process.env.CORS_ORIGIN || '*',
  
  // Rate limiting - higher limit in development for testing
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? '100' : '500'), 10), // requests per window
  
  // Trust proxy (for Cloudflare tunnel, nginx, etc.)
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production',
  
  // Request limits
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '1mb',
  
  // Auto-save interval for database (ms)
  dbAutoSaveInterval: parseInt(process.env.DB_AUTO_SAVE_INTERVAL || '5000', 10),
  
  // Feature flags
  enableMetrics: process.env.ENABLE_METRICS === 'true',
} as const;

// Validate critical production settings
export function validateConfig(): void {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  if (config.nodeEnv === 'production') {
    if (config.jwtSecret === 'dev-secret-change-in-production') {
      errors.push('JWT_SECRET must be set in production');
    }
    if (config.corsOrigin === '*') {
      warnings.push('CORS_ORIGIN is set to * in production - consider restricting');
    }
  }
  
  if (warnings.length > 0) {
    console.warn('Configuration warnings:', warnings);
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  }
}

export type Config = typeof config;
