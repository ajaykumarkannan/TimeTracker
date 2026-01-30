import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { AnalyticsData, Period, DailyTotal } from '../types';
import './Analytics.css';

export function Analytics() {
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

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
    }
    
    return { start, end };
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

  // Fill in missing days with 0 minutes
  const filledDaily = useMemo(() => {
    if (!data) return [];
    
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

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getMaxMinutes = () => {
    if (filledDaily.length === 0) return 60;
    const max = Math.max(...filledDaily.map(d => d.minutes));
    return max > 0 ? max : 60;
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
      <div className="period-selector">
        <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>Week</button>
        <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Month</button>
        <button className={period === 'quarter' ? 'active' : ''} onClick={() => setPeriod('quarter')}>Quarter</button>
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

      {/* Daily chart - stacked bars */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Daily Breakdown</h2>
          {hasData && (
            <span className="chart-hint">
              {period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'Last 3 months'}
            </span>
          )}
        </div>
        <div className="daily-chart">
          {filledDaily.map(day => {
            const isToday = new Date(day.date + 'T12:00:00').toDateString() === new Date().toDateString();
            const hasMinutes = day.minutes > 0;
            const categoryEntries = Object.entries(day.byCategory).filter(([_, mins]) => mins > 0);
            
            return (
              <div key={day.date} className={`chart-bar-container ${isToday ? 'today' : ''} ${!hasMinutes ? 'empty' : ''}`} title={`${formatFullDate(day.date)}: ${formatDuration(day.minutes)}`}>
                <div className="chart-bar-wrapper">
                  <div className="chart-bar-stack" style={{ height: `${Math.max((day.minutes / maxMinutes) * 100, hasMinutes ? 4 : 0)}%` }}>
                    {categoryEntries.map(([catName, mins]) => {
                      const segmentPercent = (mins / day.minutes) * 100;
                      const color = categoryColorMap.get(catName) || 'var(--primary)';
                      return (
                        <div
                          key={catName}
                          className="chart-bar-segment"
                          style={{ 
                            height: `${segmentPercent}%`,
                            backgroundColor: color
                          }}
                          title={`${catName}: ${formatDuration(mins)}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="chart-label">{formatShortDate(day.date)}</div>
                <div className="chart-value">{hasMinutes ? formatDuration(day.minutes) : '—'}</div>
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
