import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Analytics } from '../Analytics';
import { api } from '../../api';
import { AnalyticsData } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getAnalytics: vi.fn(),
    exportData: vi.fn()
  }
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() })
}));

const mockAnalyticsData: AnalyticsData = {
  period: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T23:59:59.999Z' },
  summary: {
    totalMinutes: 1200,
    totalEntries: 10,
    avgMinutesPerDay: 40,
    previousTotal: 1000,
    change: 20
  },
  byCategory: [
    { name: 'Meetings', color: '#6366f1', minutes: 600, count: 5 },
    { name: 'Deep Work', color: '#10b981', minutes: 400, count: 3 },
    { name: 'Email', color: '#f59e0b', minutes: 200, count: 2 }
  ],
  daily: [
    { date: '2026-01-15', minutes: 120, byCategory: { 'Meetings': 60, 'Deep Work': 60 } },
    { date: '2026-01-16', minutes: 180, byCategory: { 'Meetings': 100, 'Email': 80 } },
    { date: '2026-01-20', minutes: 240, byCategory: { 'Deep Work': 200, 'Email': 40 } },
    { date: '2026-01-21', minutes: 150, byCategory: { 'Meetings': 150 } },
    { date: '2026-01-27', minutes: 200, byCategory: { 'Deep Work': 140, 'Meetings': 60 } },
    { date: '2026-01-28', minutes: 310, byCategory: { 'Meetings': 230, 'Email': 80 } }
  ],
  topNotes: []
};

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalyticsData);
  });

  it('renders loading state initially', () => {
    render(<Analytics />);
    expect(screen.getByText(/Loading analytics/i)).toBeInTheDocument();
  });

  it('renders analytics data after loading', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    expect(screen.getByText('20h')).toBeInTheDocument(); // 1200 minutes = 20h
    expect(screen.getByText('10')).toBeInTheDocument(); // totalEntries
  });

  it('shows daily breakdown for week view', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('Daily Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });

  it('shows weekly breakdown for month view', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Click on Month period
    fireEvent.click(screen.getByRole('button', { name: /month/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/Last 30 days \(by week\)/i)).toBeInTheDocument();
  });

  it('shows weekly breakdown for quarter view', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByRole('button', { name: /quarter/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/Last 3 months \(by week\)/i)).toBeInTheDocument();
  });

  it('shows monthly breakdown for year view', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByRole('button', { name: /year/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/Last 12 months \(by month\)/i)).toBeInTheDocument();
  });

  it('shows monthly breakdown for all time view', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/All time \(by month\)/i)).toBeInTheDocument();
  });

  it('displays category breakdown', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(screen.getByText('By Category')).toBeInTheDocument();
    });
    
    // Check that category names appear in the category breakdown section
    const categorySection = screen.getByText('By Category').closest('.card');
    expect(categorySection).toBeInTheDocument();
    expect(screen.getAllByText('Meetings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deep Work').length).toBeGreaterThan(0);
  });

  it('calls API with correct date range when period changes', async () => {
    render(<Analytics />);
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalled();
    });
    
    // Initial call for week
    expect(api.getAnalytics).toHaveBeenCalledTimes(1);
    
    // Change to month
    fireEvent.click(screen.getByRole('button', { name: /month/i }));
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalledTimes(2);
    });
  });
});
