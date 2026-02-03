import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../ThemeToggle';
import { ThemeProvider } from '../../contexts/ThemeContext';

const renderWithTheme = () => {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
};

describe('ThemeToggle', () => {
  it('renders theme toggle button', () => {
    renderWithTheme();
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('theme-toggle-btn');
  });

  it('has an aria-label describing the current theme', () => {
    renderWithTheme();
    const button = screen.getByRole('button');
    // Should have one of the valid aria-labels
    const ariaLabel = button.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/mode \(click for/);
  });

  it('cycles through themes on click', () => {
    renderWithTheme();
    const button = screen.getByRole('button');
    
    const initialLabel = button.getAttribute('aria-label');
    fireEvent.click(button);
    const afterFirstClick = button.getAttribute('aria-label');
    
    // Label should change after click
    expect(afterFirstClick).not.toBe(initialLabel);
    
    fireEvent.click(button);
    const afterSecondClick = button.getAttribute('aria-label');
    expect(afterSecondClick).not.toBe(afterFirstClick);
    
    fireEvent.click(button);
    const afterThirdClick = button.getAttribute('aria-label');
    // After 3 clicks, should cycle back to initial
    expect(afterThirdClick).toBe(initialLabel);
  });

  it('renders an SVG icon', () => {
    const { container } = renderWithTheme();
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('has title attribute matching aria-label', () => {
    renderWithTheme();
    const button = screen.getByRole('button');
    const ariaLabel = button.getAttribute('aria-label');
    const title = button.getAttribute('title');
    expect(title).toBe(ariaLabel);
  });
});
