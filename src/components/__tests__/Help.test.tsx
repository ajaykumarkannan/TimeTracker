import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Help } from '../Help';
import packageInfo from '../../../package.json';

describe('Help', () => {
  it('renders getting started section', () => {
    render(<Help />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Start Tracking')).toBeInTheDocument();
    expect(screen.getByText('Organize')).toBeInTheDocument();
    expect(screen.getByText('Analyze')).toBeInTheDocument();
  });

  it('renders FAQ section with questions', () => {
    render(<Help />);
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
    expect(screen.getByText('How do I start tracking time?')).toBeInTheDocument();
    expect(screen.getByText("What's the difference between Guest and Account mode?")).toBeInTheDocument();
  });

  it('expands FAQ answer when question is clicked', () => {
    render(<Help />);
    const question = screen.getByText('How do I start tracking time?');
    
    // Answer should not be visible initially
    expect(screen.queryByText(/Click the "Start" button/)).not.toBeInTheDocument();
    
    // Click to expand
    fireEvent.click(question);
    expect(screen.getByText(/Click the "Start" button/)).toBeInTheDocument();
    
    // Click again to collapse
    fireEvent.click(question);
    expect(screen.queryByText(/Click the "Start" button/)).not.toBeInTheDocument();
  });

  it('renders keyboard shortcuts section', () => {
    render(<Help />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
  });

  it('renders contact section with links', () => {
    render(<Help />);
    expect(screen.getByText('Need More Help?')).toBeInTheDocument();
    expect(screen.getByText('Report an Issue')).toBeInTheDocument();
    expect(screen.getByText('View on GitHub')).toBeInTheDocument();
  });

  it('renders version info', () => {
    render(<Help />);
    expect(screen.getByText(`ChronoFlow v${packageInfo.version}`)).toBeInTheDocument();
  });
});
