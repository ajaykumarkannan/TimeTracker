import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Landing } from '../Landing';

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />
}));

describe('Landing', () => {
  it('renders hero copy and mode buttons', () => {
    render(<Landing onLogin={vi.fn()} onGuest={vi.fn()} />);

    expect(screen.getByText('Choose Your Mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up / Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeInTheDocument();
  });

  it('invokes handlers for login and guest actions', () => {
    const onLogin = vi.fn();
    const onGuest = vi.fn();

    render(<Landing onLogin={onLogin} onGuest={onGuest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up / Login' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onGuest).toHaveBeenCalledTimes(1);
  });
});
