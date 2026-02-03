import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Logo } from '../Logo';

describe('Logo', () => {
  it('renders with default size', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '28');
    expect(svg).toHaveAttribute('height', '28');
  });

  it('renders with custom size', () => {
    const { container } = render(<Logo size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('renders with custom className', () => {
    const { container } = render(<Logo className="custom-logo" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('custom-logo');
  });

  it('has aria-hidden for accessibility', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('contains clock elements', () => {
    const { container } = render(<Logo />);
    const circles = container.querySelectorAll('circle');
    const lines = container.querySelectorAll('line');
    expect(circles.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
  });
});
