import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken,
  authMiddleware,
  AuthRequest 
} from '../middleware/auth';

const router = Router();

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();
    
    // Check if user exists
    const existing = db.exec(`SELECT id FROM users WHERE email = ? OR username = ?`, [email, username]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    db.run(
      `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
      [email, username, passwordHash]
    );
    saveDatabase();

    const result = db.exec(`SELECT id, email, username, created_at FROM users WHERE email = ?`, [email]);
    const user = {
      id: result[0].values[0][0] as number,
      email: result[0].values[0][1] as string,
      username: result[0].values[0][2] as string,
      created_at: result[0].values[0][3] as string
    };

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [user.id, refreshToken, expiresAt]
    );
    saveDatabase();

    logger.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Registration error', { error });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const result = db.exec(
      `SELECT id, email, username, password_hash FROM users WHERE email = ?`,
      [email]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = {
      id: result[0].values[0][0] as number,
      email: result[0].values[0][1] as string,
      username: result[0].values[0][2] as string,
      password_hash: result[0].values[0][3] as string
    };

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [user.id, refreshToken, expiresAt]
    );
    saveDatabase();

    logger.info('User logged in', { userId: user.id });

    res.json({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = verifyToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const db = getDb();
    const result = db.exec(
      `SELECT id, user_id, expires_at FROM refresh_tokens WHERE token = ?`,
      [refreshToken]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    const tokenData = {
      id: result[0].values[0][0] as number,
      user_id: result[0].values[0][1] as number,
      expires_at: result[0].values[0][2] as string
    };

    if (new Date(tokenData.expires_at) < new Date()) {
      db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [tokenData.id]);
      saveDatabase();
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Get user info
    const userResult = db.exec(
      `SELECT id, email, username FROM users WHERE id = ?`,
      [tokenData.user_id]
    );

    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = {
      id: userResult[0].values[0][0] as number,
      email: userResult[0].values[0][1] as string,
      username: userResult[0].values[0][2] as string
    };

    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = generateRefreshToken(user.id, user.email);

    // Rotate refresh token
    db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [tokenData.id]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [user.id, newRefreshToken, expiresAt]
    );
    saveDatabase();

    logger.info('Token refreshed', { userId: user.id });

    res.json({
      user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    logger.error('Token refresh error', { error });
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout
router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const db = getDb();

    if (refreshToken) {
      db.run(`DELETE FROM refresh_tokens WHERE token = ?`, [refreshToken]);
    } else {
      // Logout from all devices
      db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [req.userId as number]);
    }
    saveDatabase();

    logger.info('User logged out', { userId: req.userId as number });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const result = db.exec(
      `SELECT id, email, username, created_at FROM users WHERE id = ?`,
      [req.userId as number]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = {
      id: result[0].values[0][0] as number,
      email: result[0].values[0][1] as string,
      username: result[0].values[0][2] as string,
      created_at: result[0].values[0][3] as string
    };

    res.json(user);
  } catch (error) {
    logger.error('Get user error', { error });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
