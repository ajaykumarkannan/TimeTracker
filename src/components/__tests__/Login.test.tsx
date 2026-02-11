import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Login } from '../Login';

// Mock the AuthContext
const mockLogin = vi.fn();
const mockRegister = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    register: mockRegister,
  }),
}));

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    forgotPassword: vi.fn().mockResolvedValue({}),
    resetPassword: vi.fn().mockResolvedValue({}),
  },
}));

describe('Login', () => {
  const mockOnBack = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockResolvedValue(undefined);
    mockRegister.mockResolvedValue(undefined);
  });

  describe('Remember Me Checkbox', () => {
    /**
     * Validates: Requirements 3.1
     * WHEN the login form is displayed, THE System SHALL show a "Remember me" checkbox option
     */
    it('renders remember me checkbox on login form', () => {
      render(<Login onBack={mockOnBack} />);
      
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(screen.getByText('Remember me for 30 days')).toBeInTheDocument();
    });

    /**
     * Validates: Requirements 3.1
     * Checkbox should be unchecked by default
     */
    it('checkbox is unchecked by default', () => {
      render(<Login onBack={mockOnBack} />);
      
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    /**
     * Validates: Requirements 3.1
     * Checkbox should toggle state when clicked
     */
    it('toggles checkbox state when clicked', async () => {
      render(<Login onBack={mockOnBack} />);
      
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
      
      await act(async () => {
        fireEvent.click(checkbox);
      });
      
      expect(checkbox).toBeChecked();
      
      await act(async () => {
        fireEvent.click(checkbox);
      });
      
      expect(checkbox).not.toBeChecked();
    });

    /**
     * Validates: Requirements 3.1
     * Remember me checkbox should not appear on register form
     */
    it('does not show remember me checkbox on register form', async () => {
      render(<Login onBack={mockOnBack} />);
      
      // Switch to register mode
      const createOneButton = screen.getByText('Create one');
      await act(async () => {
        fireEvent.click(createOneButton);
      });
      
      // Checkbox should not be present in register mode
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByText('Remember me for 30 days')).not.toBeInTheDocument();
    });
  });

  describe('Login Function with Remember Me', () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     * Login function should receive rememberMe=false when checkbox is unchecked
     */
    it('passes rememberMe=false to login when checkbox is unchecked', async () => {
      render(<Login onBack={mockOnBack} onSuccess={mockOnSuccess} />);
      
      // Fill in email and password
      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');
      
      await act(async () => {
        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });
      });
      
      // Ensure checkbox is unchecked (default state)
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
      
      // Submit form
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123', false);
      });
    });

    /**
     * Validates: Requirements 3.1, 3.2
     * Login function should receive rememberMe=true when checkbox is checked
     */
    it('passes rememberMe=true to login when checkbox is checked', async () => {
      render(<Login onBack={mockOnBack} onSuccess={mockOnSuccess} />);
      
      // Fill in email and password
      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');
      
      await act(async () => {
        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });
      });
      
      // Check the remember me checkbox
      const checkbox = screen.getByRole('checkbox');
      await act(async () => {
        fireEvent.click(checkbox);
      });
      expect(checkbox).toBeChecked();
      
      // Submit form
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123', true);
      });
    });

    /**
     * Validates: Requirements 3.1
     * Remember me state should persist during form interaction
     */
    it('maintains remember me state during form interaction', async () => {
      render(<Login onBack={mockOnBack} onSuccess={mockOnSuccess} />);
      
      // Check the remember me checkbox first
      const checkbox = screen.getByRole('checkbox');
      await act(async () => {
        fireEvent.click(checkbox);
      });
      expect(checkbox).toBeChecked();
      
      // Fill in email and password after checking remember me
      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');
      
      await act(async () => {
        fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
        fireEvent.change(passwordInput, { target: { value: 'securepass' } });
      });
      
      // Checkbox should still be checked
      expect(checkbox).toBeChecked();
      
      // Submit form
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'securepass', true);
      });
    });
  });
});
