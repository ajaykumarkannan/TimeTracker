import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Login } from '../Login';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn()
  })
}));

vi.mock('../../api', () => ({
  api: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn()
  }
}));

import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const mockAuth = useAuth as unknown as () => { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
const mockApi = api as any;

describe('Login flows', () => {
  const onBack = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const auth = mockAuth();
    auth.login.mockResolvedValue(undefined);
    auth.register.mockResolvedValue(undefined);
    mockApi.forgotPassword.mockResolvedValue({ resetToken: 'token-123' });
    mockApi.resetPassword.mockResolvedValue(undefined);
  });

  it('handles forgot password with reset token', async () => {
    render(<Login onBack={onBack} onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password?'));
    });

    const emailInput = screen.getByLabelText('Email');
    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));
    });

    await waitFor(() => {
      expect(mockApi.forgotPassword).toHaveBeenCalledWith('user@example.com');
      expect(screen.getByText('Set New Password')).toBeInTheDocument();
    });
  });

  it('resets password and returns to login', async () => {
    render(<Login onBack={onBack} onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password?'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reset Token'), { target: { value: 'token-123' } });
      fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
    });

    await waitFor(() => {
      expect(mockApi.resetPassword).toHaveBeenCalledWith('token-123', 'newpass123');
      expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    });
  });
});
