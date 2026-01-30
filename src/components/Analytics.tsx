import { useState, useEffect } from 'react';
import { api } from '../api';
import { AnalyticsData, Period } from '../types';
import './Analytics.css';

export function Analytics() {
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const getDateRange = (p: Period): { start: string; end: string } => {
    const end = new Date();
    const start = new Date();
    
    switch (p) {
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(end.getMonth() - 3);
        break;
    }
    
    return {
      start: start.toISOString(),
      end: end.toISOString()
    };
  };

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange(period);
        const analytics = await api.getAnalytics(start, end);
        setData(analytics);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      }
      setLoading(false);
    };

    loadAnalytics();
  }, [period]);

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getMaxMinutes = () => {
    if (!data) return 0;
    return Math.max(...data.daily.map(d => d.minutes), 1);
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

  return (
    <div className="analytics">
      {/* Period selector */}
      <div className="period-selector">
        <button 
          className={period === 'week' ? 'active' : ''} 
          onClick={() => setPeriod('week')}
        >
          Week
        </button>
        <button 
          className={period === 'month' ? 'active' : ''} 
          onClick={() => setPeriod('month')}
        >
          Month
        </button>
        <button 
          className={period === 'quarter' ? 'active' : ''} 
          onClick={() => setPeriod('quarter')}
        >
          Quarter
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
          <div className="summary-label">Categories Used</div>
          <div className="summary-value">{data.byCategory.length}</div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Daily Breakdown</h2>
        </div>
        {data.daily.length === 0 ? (
          <div className="empty-state">
            <p>No data for this period</p>
          </div>
        ) : (
          <div className="daily-chart">
            {data.daily.map(day => (
              <div key={day.date} className="chart-bar-container">
                <div className="chart-bar-wrapper">
                  <div 
                    className="chart-bar"
                    style={{ height: `${(day.minutes / maxMinutes) * 100}%` }}
                  />
                </div>
                <div className="chart-label">{formatDate(day.date).split(',')[0]}</div>
                <div className="chart-value">{formatDuration(day.minutes)}</div>
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
        {data.byCategory.length === 0 ? (
          <div className="empty-state">
            <p>No data for this period</p>
          </div>
        ) : (
          <div className="category-breakdown">
            {data.byCategory.map(cat => {
              const percentage = data.summary.totalMinutes > 0 
                ? Math.round((cat.minutes / data.summary.totalMinutes) * 100)
                : 0;
              return (
                <div key={cat.name} className="category-row">
                  <div className="category-info">
                    <div className="category-dot" style={{ backgroundColor: cat.color }} />
                    <span className="category-name">{cat.name}</span>
                  </div>
                  <div className="category-bar-wrapper">
                    <div 
                      className="category-bar"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: cat.color
                      }}
                    />
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
      <div className="card insights-card">
        <div className="card-header">
          <h2 className="card-title">Insights</h2>
        </div>
        <div className="insights">
          {data.byCategory.length > 0 && (
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
              <span>
                You tracked <strong>{data.summary.change}% more</strong> time than the previous period
              </span>
            </div>
          )}
          {data.summary.change < -20 && (
            <div className="insight">
              <span className="insight-icon">📉</span>
              <span>
                You tracked <strong>{Math.abs(data.summary.change)}% less</strong> time than the previous period
              </span>
            </div>
          )}
          {data.daily.length > 0 && (
            <div className="insight">
              <span className="insight-icon">📅</span>
              <span>
                Most productive day: <strong>
                  {formatDate(data.daily.reduce((max, d) => d.minutes > max.minutes ? d : max, data.daily[0]).date)}
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
