import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getProvider } from '../database';
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

    const provider = getProvider();
    const existing = await provider.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    const userRecord = await provider.createUser({ email, username: name, password_hash: passwordHash });
    const user = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.username,
      created_at: userRecord.created_at
    };

    // Create default categories for new user
    await createDefaultCategories(user.id);

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await provider.createRefreshToken({ user_id: user.id, token: refreshToken, expires_at: expiresAt });

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

    const provider = getProvider();
    const userRecord = await provider.findUserByEmail(email);
    if (!userRecord) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.username,
      password_hash: userRecord.password_hash
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
    await provider.createRefreshToken({ user_id: user.id, token: refreshToken, expires_at: expiresAt });

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
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = verifyToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const provider = getProvider();
    const tokenRecord = await provider.findRefreshToken(refreshToken);
    if (!tokenRecord) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    const tokenData = {
      id: tokenRecord.id,
      user_id: tokenRecord.user_id,
      expires_at: tokenRecord.expires_at
    };

    if (new Date(tokenData.expires_at) < new Date()) {
      await provider.deleteRefreshTokenById(tokenData.id);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Get user info
    const userRecord = await provider.findUserById(tokenData.user_id);
    if (!userRecord) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.username
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
    await provider.deleteRefreshTokenById(tokenData.id);
    await provider.createRefreshToken({ user_id: user.id, token: newRefreshToken, expires_at: newExpiresAt });

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
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const provider = getProvider();

    if (refreshToken) {
      await provider.deleteRefreshToken(refreshToken);
    } else {
      // Logout from all devices
      await provider.deleteRefreshTokensForUser(req.userId as number);
    }

    logger.info('User logged out', { userId: req.userId as number });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const userRecord = await provider.findUserById(req.userId as number);
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.username,
      created_at: userRecord.created_at
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

    const provider = getProvider();

    // Check if email already exists (excluding the guest's temporary email)
    const guestEmail = `anon_${sessionId}@local`;
    const existing = await provider.findUserByEmail(email);
    if (existing && existing.email !== guestEmail) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Find the guest user by their anonymous email pattern
    const guestUser = await provider.findUserByEmail(guestEmail);
    if (!guestUser) {
      return res.status(404).json({ error: 'Guest session not found' });
    }

    const guestUserId = guestUser.id;
    const passwordHash = await bcrypt.hash(password, 12);

    // Update the guest user to a registered user
    await provider.updateUser(guestUserId, { email, username: name, password_hash: passwordHash });

    const accessToken = generateAccessToken(guestUserId, email);
    const refreshToken = generateRefreshToken(guestUserId, email);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await provider.createRefreshToken({ user_id: guestUserId, token: refreshToken, expires_at: expiresAt });

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
    const provider = getProvider();
    const userId = req.userId as number;

    // Get current user
    const userRecord = await provider.findUserById(userId);
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = {
      email: userRecord.email,
      name: userRecord.username,
      password_hash: userRecord.password_hash
    };

    // Check for conflicts if changing email
    if (email && email !== currentUser.email) {
      const emailCheck = await provider.findUserByEmailExcludingId(email, userId);
      if (emailCheck) {
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
    await provider.updateUser(userId, {
      email: email || currentUser.email,
      username: name || currentUser.name,
      password_hash: newPasswordHash
    });

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
router.delete('/delete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const userId = req.userId as number;
    await provider.deleteUser(userId);

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

    const provider = getProvider();
    const userRecord = await provider.findUserByEmail(email);
    if (!userRecord) {
      logger.info('Password reset requested for non-existent email', { email });
      return res.json({ message: 'If an account exists with this email, a reset link has been sent' });
    }

    const userId = userRecord.id;

    // Generate reset token (simple random string for demo - in production use crypto)
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Delete any existing reset tokens for this user
    await provider.upsertPasswordResetToken({ user_id: userId, token: resetToken, expires_at: expiresAt });

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

    const provider = getProvider();
    const tokenRecord = await provider.findPasswordResetToken(token);
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const tokenData = {
      user_id: tokenRecord.user_id,
      expires_at: tokenRecord.expires_at
    };

    if (new Date(tokenData.expires_at) < new Date()) {
      await provider.deletePasswordResetToken(token);
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await provider.updateUser(tokenData.user_id, { password_hash: passwordHash });

    // Delete the used token
    await provider.deletePasswordResetToken(token);

    // Invalidate all refresh tokens for security
    await provider.deleteRefreshTokensForUser(tokenData.user_id);

    logger.info('Password reset successful', { userId: tokenData.user_id });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Reset password error', { error });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
