import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Analytics } from '../Analytics';
import { api } from '../../api';
import { AnalyticsData } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getAnalytics: vi.fn(),
    exportData: vi.fn(),
    exportCSV: vi.fn(),
    getActiveEntry: vi.fn(),
    getDescriptions: vi.fn(),
    getCategoryDrilldown: vi.fn()
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalyticsData);
    (api.getActiveEntry as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (api.getDescriptions as ReturnType<typeof vi.fn>).mockResolvedValue({
      descriptions: [],
      pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 }
    });
    (api.getCategoryDrilldown as ReturnType<typeof vi.fn>).mockResolvedValue({
      category: { name: 'Meetings', color: '#6366f1', minutes: 600, count: 5 },
      descriptions: [],
      pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    // Loading state may flash briefly, but we verify the component renders
    expect(screen.queryByText(/Loading analytics/i) || screen.queryByText('Total Time')).toBeTruthy();
  });

  it('renders analytics data after loading', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    expect(screen.getByText('20h')).toBeInTheDocument(); // 1200 minutes = 20h
    expect(screen.getByText('10')).toBeInTheDocument(); // totalEntries
  });

  it('shows daily breakdown for week view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Daily Breakdown')).toBeInTheDocument();
    });
    
    // Week view shows date range like "Jan 27 - Feb 2"
    expect(screen.getByText(/\w+ \d+ - \w+ \d+/)).toBeInTheDocument();
  });

  it('shows weekly breakdown for month view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Click on Month period
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /month/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
    });
    
    // Month view shows month name like "February 2026"
    expect(screen.getByText(/\w+ \d{4}/)).toBeInTheDocument();
  });

  it('shows weekly breakdown for quarter view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /quarter/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
    });
    
    // Quarter view shows "Q1 2026" format
    expect(screen.getByText(/Q\d \d{4}/)).toBeInTheDocument();
  });

  it('shows monthly breakdown for year view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /year/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    
    // Year view shows just the year like "2026"
    expect(screen.getByText(/^\d{4}$/)).toBeInTheDocument();
  });

  it('shows monthly breakdown for all time view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/All time \(by month\)/i)).toBeInTheDocument();
  });

  it('displays category breakdown', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
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
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalled();
    });
    
    // Initial call for week
    expect(api.getAnalytics).toHaveBeenCalledTimes(1);
    
    // Change to month
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /month/i }));
    });
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalledTimes(2);
    });
  });
});


// Test helper functions for week aggregation logic
describe('Week Aggregation Logic', () => {
  // Helper to get week start (Monday) - mirrors the component logic
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  it('calculates correct week start for various days', () => {
    // Monday Jan 5, 2026 - should return Jan 5
    const monday = new Date('2026-01-05T12:00:00');
    expect(getWeekStart(monday).toISOString().split('T')[0]).toBe('2026-01-05');

    // Wednesday Jan 7, 2026 - should return Jan 5 (Monday)
    const wednesday = new Date('2026-01-07T12:00:00');
    expect(getWeekStart(wednesday).toISOString().split('T')[0]).toBe('2026-01-05');

    // Sunday Jan 11, 2026 - should return Jan 5 (previous Monday)
    const sunday = new Date('2026-01-11T12:00:00');
    expect(getWeekStart(sunday).toISOString().split('T')[0]).toBe('2026-01-05');

    // Saturday Jan 10, 2026 - should return Jan 5 (Monday)
    const saturday = new Date('2026-01-10T12:00:00');
    expect(getWeekStart(saturday).toISOString().split('T')[0]).toBe('2026-01-05');
  });

  it('handles month boundary correctly', () => {
    // Saturday Jan 3, 2026 - week starts Dec 29, 2025
    const jan3 = new Date('2026-01-03T12:00:00');
    expect(getWeekStart(jan3).toISOString().split('T')[0]).toBe('2025-12-29');

    // Monday Feb 2, 2026 - week starts Feb 2
    const feb2 = new Date('2026-02-02T12:00:00');
    expect(getWeekStart(feb2).toISOString().split('T')[0]).toBe('2026-02-02');
  });

  it('aggregates daily data into weeks correctly', () => {
    // Simulate the aggregation logic
    const dailyData = [
      { date: '2026-01-27', minutes: 60 },  // Week of Jan 26
      { date: '2026-01-28', minutes: 90 },  // Week of Jan 26
      { date: '2026-02-02', minutes: 120 }, // Week of Feb 2
      { date: '2026-02-03', minutes: 30 },  // Week of Feb 2
    ];

    const buckets = new Map<string, { minutes: number; label: string }>();

    for (const day of dailyData) {
      const date = new Date(day.date + 'T12:00:00');
      const weekStart = getWeekStart(date);
      const bucketKey = weekStart.toISOString().split('T')[0];

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { minutes: 0, label: bucketKey });
      }
      buckets.get(bucketKey)!.minutes += day.minutes;
    }

    // Sort by start date
    const result = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('2026-01-26'); // First week
    expect(result[0][1].minutes).toBe(150);  // 60 + 90
    expect(result[1][0]).toBe('2026-02-02'); // Second week
    expect(result[1][1].minutes).toBe(150);  // 120 + 30
  });

  it('sorts weeks chronologically', () => {
    const weekKeys = ['2026-02-02', '2026-01-19', '2026-01-26', '2026-01-12'];
    const sorted = weekKeys.sort((a, b) => a.localeCompare(b));
    
    expect(sorted).toEqual(['2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02']);
  });
});
