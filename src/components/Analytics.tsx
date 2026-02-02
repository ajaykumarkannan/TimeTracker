import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { AnalyticsData, Period, DailyTotal } from '../types';
import './Analytics.css';

type AggregatedTotal = {
  label: string;
  startDate: string;
  endDate: string;
  minutes: number;
  byCategory: Record<string, number>;
};

export function Analytics() {
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const getDateRange = (p: Period): { start: Date; end: Date } => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    
    switch (p) {
      case 'week':
        start.setDate(end.getDate() - 6);
        break;
      case 'month':
        start.setDate(end.getDate() - 29);
        break;
      case 'quarter':
        start.setMonth(end.getMonth() - 3);
        break;
      case 'year':
        // Go back to the first day of the month, 11 months ago
        // This gives us 12 months total (11 previous + current)
        start.setMonth(end.getMonth() - 11);
        start.setDate(1);
        break;
      case 'all':
        // Only go back 5 years max for performance - most users won't have data older than this
        start.setFullYear(end.getFullYear() - 5);
        break;
    }
    
    return { start, end };
  };

  // Determine aggregation level based on period
  const getAggregation = (p: Period): 'day' | 'week' | 'month' => {
    switch (p) {
      case 'week':
        return 'day';
      case 'month':
      case 'quarter':
        return 'week';
      case 'year':
      case 'all':
        return 'month';
    }
  };

  // Get week start date (Monday)
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Helper functions - defined before useMemo hooks that use them
  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = await api.exportData();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronoflow-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
    setExporting(false);
  };

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange(period);
        const analytics = await api.getAnalytics(start.toISOString(), end.toISOString());
        setData(analytics);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      }
      setLoading(false);
    };

    loadAnalytics();
  }, [period]);

  // Fill in missing days with 0 minutes (skip for 'all' period - too slow)
  const filledDaily = useMemo(() => {
    if (!data) return [];
    
    // For 'all' period, just use the raw data - no need to fill gaps
    if (period === 'all') {
      return data.daily;
    }
    
    const { start, end } = getDateRange(period);
    const dailyMap = new Map(data.daily.map(d => [d.date, d]));
    const filled: DailyTotal[] = [];
    
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const existing = dailyMap.get(dateStr);
      filled.push(existing || { date: dateStr, minutes: 0, byCategory: {} });
      current.setDate(current.getDate() + 1);
    }
    
    return filled;
  }, [data, period]);

  // Aggregate daily data into weeks or months based on period
  const aggregatedData = useMemo((): AggregatedTotal[] => {
    if (!data || filledDaily.length === 0) return [];
    
    const aggregation = getAggregation(period);
    
    if (aggregation === 'day') {
      // No aggregation needed for week view
      return filledDaily.map(d => ({
        label: formatShortDate(d.date),
        startDate: d.date,
        endDate: d.date,
        minutes: d.minutes,
        byCategory: d.byCategory
      }));
    }
    
    const buckets = new Map<string, AggregatedTotal>();
    
    for (const day of filledDaily) {
      const date = new Date(day.date + 'T12:00:00');
      let bucketKey: string;
      let label: string;
      let startDate: string;
      let endDate: string;
      
      if (aggregation === 'week') {
        const weekStart = getWeekStart(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        bucketKey = weekStart.toISOString().split('T')[0];
        startDate = bucketKey;
        endDate = weekEnd.toISOString().split('T')[0];
        
        // Format: "Jan 6-12" or "Dec 30 - Jan 5"
        const startMonth = weekStart.toLocaleDateString(undefined, { month: 'short' });
        const endMonth = weekEnd.toLocaleDateString(undefined, { month: 'short' });
        if (startMonth === endMonth) {
          label = `${startMonth} ${weekStart.getDate()}-${weekEnd.getDate()}`;
        } else {
          label = `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}`;
        }
      } else {
        // Monthly aggregation
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        startDate = monthStart.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
        label = date.toLocaleDateString(undefined, { month: 'short', year: period === 'all' ? '2-digit' : undefined });
      }
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          label,
          startDate,
          endDate,
          minutes: 0,
          byCategory: {}
        });
      }
      
      const bucket = buckets.get(bucketKey)!;
      bucket.minutes += day.minutes;
      
      // Merge category data
      for (const [catName, mins] of Object.entries(day.byCategory)) {
        bucket.byCategory[catName] = (bucket.byCategory[catName] || 0) + mins;
      }
    }
    
    // Sort buckets by start date to ensure chronological order
    let result = Array.from(buckets.values()).sort((a, b) => 
      a.startDate.localeCompare(b.startDate)
    );
    
    // For "all time" view, only show months with activity
    if (period === 'all') {
      result = result.filter(b => b.minutes > 0);
    }
    
    return result;
  }, [filledDaily, period, data]);

  // Determine if we need vertical labels (long labels or many items)
  const needsVerticalLabels = useMemo(() => {
    if (aggregatedData.length === 0) return false;
    const aggregation = getAggregation(period);
    // Use vertical labels for week aggregation (long date ranges) or many items
    return aggregation === 'week' || aggregatedData.length > 12;
  }, [aggregatedData, period]);

  // Determine if chart needs scrolling based on period and item count
  const needsScrolling = useMemo(() => {
    const aggregation = getAggregation(period);
    if (aggregation === 'day') return false; // Week view (7 days) always fits
    if (aggregation === 'week') return aggregatedData.length > 6; // Month (5 weeks) fits, quarter (13+ weeks) scrolls
    return aggregatedData.length > 12; // Year (12 months) fits, all time may scroll
  }, [aggregatedData, period]);

  // Ref for scrolling to end
  const chartRef = useRef<HTMLDivElement>(null);

  // Scroll to end (newest) when data changes
  useEffect(() => {
    if (chartRef.current && needsScrolling) {
      chartRef.current.scrollLeft = chartRef.current.scrollWidth;
    }
  }, [aggregatedData, needsScrolling]);

  // Build category color map for stacked bars
  const categoryColorMap = useMemo(() => {
    if (!data) return new Map<string, string>();
    return new Map(data.byCategory.map(c => [c.name, c.color]));
  }, [data]);

  const formatDuration = (minutes: number) => {
    if (minutes === 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    if (startDate === endDate) {
      return formatFullDate(startDate);
    }
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  const getMaxMinutes = () => {
    if (aggregatedData.length === 0) return 60;
    const max = Math.max(...aggregatedData.map(d => d.minutes));
    return max > 0 ? max : 60;
  };

  const getChartTitle = () => {
    const aggregation = getAggregation(period);
    switch (aggregation) {
      case 'day':
        return 'Daily Breakdown';
      case 'week':
        return 'Weekly Breakdown';
      case 'month':
        return 'Monthly Breakdown';
    }
  };

  const getChartHint = () => {
    switch (period) {
      case 'week':
        return 'Last 7 days';
      case 'month':
        return 'Last 30 days (by week)';
      case 'quarter':
        return 'Last 3 months (by week)';
      case 'year':
        return 'Last 12 months (by month)';
      case 'all':
        return 'All time (by month)';
    }
  };

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="loading-spinner" />
        Loading analytics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="analytics-error">
        Failed to load analytics
      </div>
    );
  }

  const maxMinutes = getMaxMinutes();
  const hasData = data.summary.totalMinutes > 0;

  return (
    <div className="analytics">
      {/* Period selector */}
      <div className="analytics-header">
        <div className="period-selector">
          <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>Week</button>
          <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Month</button>
          <button className={period === 'quarter' ? 'active' : ''} onClick={() => setPeriod('quarter')}>Quarter</button>
          <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Year</button>
          <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>All</button>
        </div>
        <button className="export-btn" onClick={handleExport} disabled={exporting}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">Total Time</div>
          <div className="summary-value">{formatDuration(data.summary.totalMinutes)}</div>
          {data.summary.change !== 0 && (
            <div className={`summary-change ${data.summary.change > 0 ? 'positive' : 'negative'}`}>
              {data.summary.change > 0 ? '↑' : '↓'} {Math.abs(data.summary.change)}% vs previous
            </div>
          )}
        </div>
        <div className="summary-card">
          <div className="summary-label">Entries</div>
          <div className="summary-value">{data.summary.totalEntries}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Daily Average</div>
          <div className="summary-value">{formatDuration(data.summary.avgMinutesPerDay)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Active Days</div>
          <div className="summary-value">{data.daily.length}</div>
        </div>
      </div>

      {/* Daily/Weekly/Monthly chart - stacked bars */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{getChartTitle()}</h2>
          {hasData && (
            <span className="chart-hint">{getChartHint()}</span>
          )}
        </div>
        <div 
          ref={chartRef}
          className={`daily-chart ${!hasData ? 'empty' : ''} view-${getAggregation(period)} ${needsVerticalLabels ? 'vertical-labels' : ''} ${needsScrolling ? 'scrollable' : ''}`}
        >
          {aggregatedData.map((bucket, idx) => {
            const isCurrentPeriod = idx === aggregatedData.length - 1;
            const hasMinutes = bucket.minutes > 0;
            const categoryEntries = Object.entries(bucket.byCategory).filter(([_, mins]) => mins > 0);
            // Calculate flex ratio: bar takes up proportional space, spacer takes the rest
            const barRatio = bucket.minutes / maxMinutes;
            const spacerRatio = 1 - barRatio;
            
            return (
              <div key={bucket.startDate} className={`chart-bar-container ${isCurrentPeriod ? 'today' : ''} ${!hasMinutes ? 'empty' : ''}`} title={`${formatDateRange(bucket.startDate, bucket.endDate)}: ${formatDuration(bucket.minutes)}`}>
                <div className="chart-bar-wrapper">
                  {/* Spacer pushes the bar stack to the bottom */}
                  <div style={{ flex: spacerRatio }} />
                  <div className="chart-bar-stack" style={{ flex: hasMinutes ? barRatio : 0, minHeight: hasMinutes ? '4px' : 0 }}>
                    {categoryEntries.map(([catName, mins]) => {
                      const segmentPercent = (mins / bucket.minutes) * 100;
                      const color = categoryColorMap.get(catName) || 'var(--primary)';
                      return (
                        <div
                          key={catName}
                          className="chart-bar-segment"
                          style={{ 
                            flex: segmentPercent,
                            backgroundColor: color
                          }}
                          title={`${catName}: ${formatDuration(mins)}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="chart-label">{bucket.label}</div>
                <div className="chart-value">{hasMinutes ? formatDuration(bucket.minutes) : '—'}</div>
              </div>
            );
          })}
        </div>
        {/* Legend for stacked chart */}
        {hasData && data.byCategory.filter(c => c.minutes > 0).length > 0 && (
          <div className="chart-legend">
            {data.byCategory.filter(c => c.minutes > 0).map(cat => (
              <div key={cat.name} className="legend-item">
                <div className="legend-dot" style={{ backgroundColor: cat.color }} />
                <span className="legend-label">{cat.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">By Category</h2>
        </div>
        {!hasData ? (
          <div className="empty-state"><p>No data for this period</p></div>
        ) : (
          <div className="category-breakdown">
            {data.byCategory.filter(c => c.minutes > 0).map(cat => {
              const percentage = Math.round((cat.minutes / data.summary.totalMinutes) * 100);
              return (
                <div key={cat.name} className="category-row">
                  <div className="category-info">
                    <div className="category-dot" style={{ backgroundColor: cat.color }} />
                    <span className="category-name">{cat.name}</span>
                  </div>
                  <div className="category-bar-wrapper">
                    <div className="category-bar" style={{ width: `${percentage}%`, backgroundColor: cat.color }} />
                  </div>
                  <div className="category-stats">
                    <span className="category-time">{formatDuration(cat.minutes)}</span>
                    <span className="category-percent">{percentage}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top tasks */}
      {data.topNotes.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Top Tasks</h2>
          </div>
          <div className="top-tasks">
            {data.topNotes.map((note, i) => (
              <div key={i} className="task-row">
                <span className="task-rank">#{i + 1}</span>
                <span className="task-name">{note.note}</span>
                <span className="task-count">{note.count}×</span>
                <span className="task-time">{formatDuration(note.total_minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {hasData && (
        <div className="card insights-card">
          <div className="card-header">
            <h2 className="card-title">Insights</h2>
          </div>
          <div className="insights">
            {data.byCategory.length > 0 && data.byCategory[0].minutes > 0 && (
              <div className="insight">
                <span className="insight-icon">🎯</span>
                <span>
                  <strong>{data.byCategory[0].name}</strong> takes up most of your time 
                  ({Math.round((data.byCategory[0].minutes / data.summary.totalMinutes) * 100)}%)
                </span>
              </div>
            )}
            {data.summary.change > 20 && (
              <div className="insight">
                <span className="insight-icon">📈</span>
                <span>You tracked <strong>{data.summary.change}% more</strong> time than the previous period</span>
              </div>
            )}
            {data.summary.change < -20 && (
              <div className="insight">
                <span className="insight-icon">📉</span>
                <span>You tracked <strong>{Math.abs(data.summary.change)}% less</strong> time than the previous period</span>
              </div>
            )}
            {data.daily.length > 0 && (
              <div className="insight">
                <span className="insight-icon">📅</span>
                <span>
                  Most tracked day: <strong>
                    {formatFullDate(data.daily.reduce((max, d) => d.minutes > max.minutes ? d : max, data.daily[0]).date)}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
