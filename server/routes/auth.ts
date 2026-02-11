import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { config } from '../config';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken,
  authMiddleware,
  AuthRequest,
  createDefaultCategories
} from '../middleware/auth';

const router = Router();

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();
    
    // Check if user exists
    const existing = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    db.run(
      `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
      [email, name, passwordHash]
    );
    saveDatabase();

    const result = db.exec(`SELECT id, email, username, created_at FROM users WHERE email = ?`, [email]);
    const user = {
      id: result[0].values[0][0] as number,
      email: result[0].values[0][1] as string,
      name: result[0].values[0][2] as string,
      created_at: result[0].values[0][3] as string
    };

    // Create default categories for new user
    createDefaultCategories(user.id);

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
      user: { id: user.id, email: user.email, name: user.name },
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
    const { email, password, rememberMe } = req.body;

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
      name: result[0].values[0][2] as string,
      password_hash: result[0].values[0][3] as string
    };

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email, rememberMe);

    // Calculate token expiry: 30 days if rememberMe is true, 7 days otherwise
    const tokenExpiry = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days (default)
    const expiresAt = new Date(Date.now() + tokenExpiry).toISOString();

    // Store refresh token with calculated expiry
    db.run(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [user.id, refreshToken, expiresAt]
    );
    saveDatabase();

    logger.info('User logged in', { userId: user.id, rememberMe: !!rememberMe });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
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
      name: userResult[0].values[0][2] as string
    };

    const newAccessToken = generateAccessToken(user.id, user.email);
    
    // Determine if original token was a "remember me" token (30-day)
    // by checking if remaining time is greater than 7 days
    const originalExpiresAt = new Date(tokenData.expires_at);
    const now = new Date();
    const remainingMs = originalExpiresAt.getTime() - now.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    // If remaining time > 7 days, it was a 30-day token, maintain extended expiration
    const isExtendedToken = remainingMs > sevenDaysMs;
    const newRefreshToken = generateRefreshToken(user.id, user.email, isExtendedToken);
    const tokenExpiry = isExtendedToken ? thirtyDaysMs : sevenDaysMs;
    const newExpiresAt = new Date(Date.now() + tokenExpiry).toISOString();

    // Rotate refresh token
    db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [tokenData.id]);
    db.run(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [user.id, newRefreshToken, newExpiresAt]
    );
    saveDatabase();

    logger.info('Token refreshed', { userId: user.id, extendedExpiration: isExtendedToken });

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
      name: result[0].values[0][2] as string,
      created_at: result[0].values[0][3] as string
    };

    res.json(user);
  } catch (error) {
    logger.error('Get user error', { error });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Convert guest to registered account
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { email, name, password } = req.body;
    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required for conversion' });
    }

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();

    // Check if email already exists (excluding the guest's temporary email)
    const guestEmail = `anon_${sessionId}@local`;
    const existing = db.exec(`SELECT id FROM users WHERE email = ? AND email != ?`, [email, guestEmail]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Find the guest user by their anonymous email pattern
    const guestResult = db.exec(`SELECT id FROM users WHERE email = ?`, [guestEmail]);
    if (guestResult.length === 0 || guestResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Guest session not found' });
    }

    const guestUserId = guestResult[0].values[0][0] as number;
    const passwordHash = await bcrypt.hash(password, 12);

    // Update the guest user to a registered user
    db.run(
      `UPDATE users SET email = ?, username = ?, password_hash = ? WHERE id = ?`,
      [email, name, passwordHash, guestUserId]
    );
    saveDatabase();

    const accessToken = generateAccessToken(guestUserId, email);
    const refreshToken = generateRefreshToken(guestUserId, email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [guestUserId, refreshToken, expiresAt]
    );
    saveDatabase();

    logger.info('Guest converted to account', { userId: guestUserId, email });

    res.json({
      user: { id: guestUserId, email, name },
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Convert error', { error });
    res.status(500).json({ error: 'Conversion failed' });
  }
});

// Update account
router.put('/update', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const db = getDb();
    const userId = req.userId as number;

    // Get current user
    const userResult = db.exec(
      `SELECT email, username, password_hash FROM users WHERE id = ?`,
      [userId]
    );

    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = {
      email: userResult[0].values[0][0] as string,
      name: userResult[0].values[0][1] as string,
      password_hash: userResult[0].values[0][2] as string
    };

    // Check for conflicts if changing email
    if (email && email !== currentUser.email) {
      const emailCheck = db.exec(`SELECT id FROM users WHERE email = ? AND id != ?`, [email, userId]);
      if (emailCheck.length > 0 && emailCheck[0].values.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    // Handle password change
    let newPasswordHash = currentUser.password_hash;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required to change password' });
      }
      const validPassword = await bcrypt.compare(currentPassword, currentUser.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      newPasswordHash = await bcrypt.hash(newPassword, 12);
    }

    // Update user
    db.run(
      `UPDATE users SET email = ?, username = ?, password_hash = ? WHERE id = ?`,
      [email || currentUser.email, name || currentUser.name, newPasswordHash, userId]
    );
    saveDatabase();

    logger.info('Account updated', { userId });

    res.json({
      id: userId,
      email: email || currentUser.email,
      name: name || currentUser.name
    });
  } catch (error) {
    logger.error('Update account error', { error });
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete account
router.delete('/delete', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.userId as number;

    // Delete all user data
    db.run(`DELETE FROM time_entries WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM categories WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    saveDatabase();

    logger.info('Account deleted', { userId });
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error', { error });
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Request password reset
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDb();
    const result = db.exec(`SELECT id, email FROM users WHERE email = ?`, [email]);

    // Always return success to prevent email enumeration
    if (result.length === 0 || result[0].values.length === 0) {
      logger.info('Password reset requested for non-existent email', { email });
      return res.json({ message: 'If an account exists with this email, a reset link has been sent' });
    }

    const userId = result[0].values[0][0] as number;

    // Generate reset token (simple random string for demo - in production use crypto)
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Delete any existing reset tokens for this user
    db.run(`DELETE FROM password_reset_tokens WHERE user_id = ?`, [userId]);

    // Store reset token
    db.run(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [userId, resetToken, expiresAt]
    );
    saveDatabase();

    // In a real app, send email here. For demo, log the token
    logger.info('Password reset token generated', { userId, resetToken });

    // Only return token in development mode for testing purposes
    if (config.nodeEnv === 'production') {
      res.json({ 
        message: 'If an account exists with this email, a reset link has been sent'
      });
    } else {
      // Development only - token included for testing
      res.json({ 
        message: 'If an account exists with this email, a reset link has been sent',
        resetToken 
      });
    }
  } catch (error) {
    logger.error('Forgot password error', { error });
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();
    const result = db.exec(
      `SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?`,
      [token]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const tokenData = {
      user_id: result[0].values[0][0] as number,
      expires_at: result[0].values[0][1] as string
    };

    if (new Date(tokenData.expires_at) < new Date()) {
      db.run(`DELETE FROM password_reset_tokens WHERE token = ?`, [token]);
      saveDatabase();
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, tokenData.user_id]);

    // Delete the used token
    db.run(`DELETE FROM password_reset_tokens WHERE token = ?`, [token]);

    // Invalidate all refresh tokens for security
    db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [tokenData.user_id]);
    saveDatabase();

    logger.info('Password reset successful', { userId: tokenData.user_id });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Reset password error', { error });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
