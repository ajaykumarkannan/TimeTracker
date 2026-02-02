import { useState, useMemo, useEffect } from 'react';
import { api } from '../api';
import { ColumnMapping, ImportEntry } from '../types';
import './ImportWizard.css';

interface Props {
  csv: string;
  onClose: () => void;
  onSuccess: (result: { imported: number; skipped: number; errors: string[] }) => void;
}

type Step = 'mapping' | 'preview' | 'importing';

const REQUIRED_FIELDS = ['category', 'startTime'] as const;
const OPTIONAL_FIELDS = ['note', 'endTime', 'color'] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

const FIELD_LABELS: Record<string, string> = {
  category: 'Category',
  startTime: 'Start Time',
  endTime: 'End Time',
  note: 'Note',
  color: 'Color (optional)'
};

// Common timezone offsets
const TIMEZONE_OFFSETS = [
  { label: 'UTC-12:00 (Baker Island)', value: -720 },
  { label: 'UTC-11:00 (Samoa)', value: -660 },
  { label: 'UTC-10:00 (Hawaii)', value: -600 },
  { label: 'UTC-09:00 (Alaska)', value: -540 },
  { label: 'UTC-08:00 (Pacific)', value: -480 },
  { label: 'UTC-07:00 (Mountain)', value: -420 },
  { label: 'UTC-06:00 (Central)', value: -360 },
  { label: 'UTC-05:00 (Eastern)', value: -300 },
  { label: 'UTC-04:00 (Atlantic)', value: -240 },
  { label: 'UTC-03:00 (Buenos Aires)', value: -180 },
  { label: 'UTC-02:00 (Mid-Atlantic)', value: -120 },
  { label: 'UTC-01:00 (Azores)', value: -60 },
  { label: 'UTC+00:00 (London, UTC)', value: 0 },
  { label: 'UTC+01:00 (Paris, Berlin)', value: 60 },
  { label: 'UTC+02:00 (Cairo, Helsinki)', value: 120 },
  { label: 'UTC+03:00 (Moscow, Istanbul)', value: 180 },
  { label: 'UTC+04:00 (Dubai)', value: 240 },
  { label: 'UTC+05:00 (Karachi)', value: 300 },
  { label: 'UTC+05:30 (Mumbai)', value: 330 },
  { label: 'UTC+06:00 (Dhaka)', value: 360 },
  { label: 'UTC+07:00 (Bangkok)', value: 420 },
  { label: 'UTC+08:00 (Singapore, Beijing)', value: 480 },
  { label: 'UTC+09:00 (Tokyo, Seoul)', value: 540 },
  { label: 'UTC+10:00 (Sydney)', value: 600 },
  { label: 'UTC+11:00 (Solomon Islands)', value: 660 },
  { label: 'UTC+12:00 (Auckland)', value: 720 },
];

export function ImportWizard({ csv, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('mapping');
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Default to browser's current timezone offset (negative because JS returns offset from UTC)
  const [timeOffset, setTimeOffset] = useState(() => -new Date().getTimezoneOffset());

  // Load initial preview on mount
  useEffect(() => {
    loadPreview();
  }, []);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.previewCSV(csv);
      if (result.headers) {
        setHeaders(result.headers);
        setPreview(result.preview || []);
        setMapping(result.suggestedMapping || {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
    setLoading(false);
  };

  const loadEntriesPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.previewCSV(csv, mapping, timeOffset);
      if (result.entries) {
        setEntries(result.entries);
        setNewCategories(result.newCategories || []);
        setStep('preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview entries');
    }
    setLoading(false);
  };

  const handleMappingChange = (field: string, columnIndex: number | undefined) => {
    setMapping(prev => {
      const next = { ...prev };
      if (columnIndex === undefined) {
        delete next[field as keyof ColumnMapping];
      } else {
        next[field as keyof ColumnMapping] = columnIndex;
      }
      return next;
    });
  };

  const handleEntryChange = (index: number, field: keyof ImportEntry, value: string | boolean | null) => {
    setEntries(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleToggleSkip = (index: number) => {
    setEntries(prev => {
      const next = [...prev];
      next[index] = { ...next[index], skip: !next[index].skip };
      return next;
    });
  };

  const handleImport = async () => {
    setStep('importing');
    setError('');
    try {
      const entriesToImport = entries.filter(e => !e.skip && !e.error);
      const result = await api.importCSV(csv, mapping, entriesToImport);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  const isMappingValid = useMemo(() => {
    return REQUIRED_FIELDS.every(field => mapping[field] !== undefined);
  }, [mapping]);

  const stats = useMemo(() => {
    const valid = entries.filter(e => !e.error && !e.skip).length;
    const errors = entries.filter(e => e.error).length;
    const skipped = entries.filter(e => e.skip).length;
    return { valid, errors, skipped, total: entries.length };
  }, [entries]);

  const formatDateTime = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  if (loading && step === 'mapping') {
    return (
      <div className="import-wizard-overlay" onClick={onClose}>
        <div className="import-wizard" onClick={e => e.stopPropagation()}>
          <div className="import-wizard-loading">
            <div className="loading-spinner" />
            <p>Parsing CSV...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="import-wizard-overlay" onClick={onClose}>
      <div className="import-wizard" onClick={e => e.stopPropagation()}>
        <div className="import-wizard-header">
          <h2>Import Time Entries</h2>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        {/* Progress indicator */}
        <div className="import-wizard-progress">
          <div className={`progress-step ${step === 'mapping' ? 'active' : 'done'}`}>
            <span className="step-number">1</span>
            <span className="step-label">Map Columns</span>
          </div>
          <div className="progress-line" />
          <div className={`progress-step ${step === 'preview' ? 'active' : step === 'importing' ? 'done' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Review & Edit</span>
          </div>
          <div className="progress-line" />
          <div className={`progress-step ${step === 'importing' ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Import</span>
          </div>
        </div>

        {error && <div className="import-wizard-error">{error}</div>}

        {/* Step 1: Column Mapping */}
        {step === 'mapping' && (
          <div className="import-wizard-content">
            <p className="import-wizard-description">
              Match your CSV columns to ChronoFlow fields. Category and Start Time are required.
            </p>

            <div className="mapping-grid">
              {ALL_FIELDS.map(field => (
                <div key={field} className="mapping-row">
                  <label className={REQUIRED_FIELDS.includes(field as typeof REQUIRED_FIELDS[number]) ? 'required' : ''}>
                    {FIELD_LABELS[field]}
                  </label>
                  <select
                    value={mapping[field as keyof ColumnMapping] ?? ''}
                    onChange={e => handleMappingChange(field, e.target.value ? parseInt(e.target.value) : undefined)}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((header, i) => (
                      <option key={i} value={i}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
              
              <div className="mapping-row">
                <label>Time Offset</label>
                <select
                  value={timeOffset}
                  onChange={e => setTimeOffset(parseInt(e.target.value))}
                >
                  {TIMEZONE_OFFSETS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {preview.length > 0 && (
              <div className="mapping-preview">
                <h4>Preview (first {preview.length} rows)</h4>
                <div className="preview-table-wrapper">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="import-wizard-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={loadEntriesPreview}
                disabled={!isMappingValid || loading}
              >
                {loading ? 'Loading...' : 'Next: Review Entries'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Preview & Edit */}
        {step === 'preview' && (
          <div className="import-wizard-content">
            <div className="import-stats">
              <span className="stat valid">{stats.valid} valid</span>
              {stats.errors > 0 && <span className="stat errors">{stats.errors} errors</span>}
              {stats.skipped > 0 && <span className="stat skipped">{stats.skipped} skipped</span>}
              <span className="stat total">of {stats.total} total</span>
            </div>

            {newCategories.length > 0 && (
              <div className="new-categories-notice">
                <strong>New categories to create:</strong> {newCategories.join(', ')}
              </div>
            )}

            <div className="entries-table-wrapper">
              <table className="entries-table">
                <thead>
                  <tr>
                    <th className="col-skip">Skip</th>
                    <th className="col-category">Category</th>
                    <th className="col-note">Note</th>
                    <th className="col-start">Start</th>
                    <th className="col-end">End</th>
                    <th className="col-duration">Duration</th>
                    <th className="col-status">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr key={i} className={`${entry.error ? 'has-error' : ''} ${entry.skip ? 'skipped' : ''}`}>
                      <td className="col-skip">
                        <input
                          type="checkbox"
                          checked={entry.skip || false}
                          onChange={() => handleToggleSkip(i)}
                        />
                      </td>
                      <td className="col-category">
                        <input
                          type="text"
                          value={entry.category}
                          onChange={e => handleEntryChange(i, 'category', e.target.value)}
                          disabled={entry.skip}
                        />
                        {entry.isNewCategory && <span className="new-badge">new</span>}
                      </td>
                      <td className="col-note">
                        <input
                          type="text"
                          value={entry.note || ''}
                          onChange={e => handleEntryChange(i, 'note', e.target.value || null)}
                          disabled={entry.skip}
                          placeholder="—"
                        />
                      </td>
                      <td className="col-start">{formatDateTime(entry.startTime)}</td>
                      <td className="col-end">{formatDateTime(entry.endTime || '')}</td>
                      <td className="col-duration">{formatDuration(entry.duration)}</td>
                      <td className="col-status">
                        {entry.error ? (
                          <span className="status-error" title={entry.error}>⚠️</span>
                        ) : entry.skip ? (
                          <span className="status-skip">—</span>
                        ) : (
                          <span className="status-ok">✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-wizard-actions">
              <button className="btn btn-ghost" onClick={() => setStep('mapping')}>Back</button>
              <button 
                className="btn btn-primary" 
                onClick={handleImport}
                disabled={stats.valid === 0}
              >
                Import {stats.valid} Entries
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="import-wizard-content">
            <div className="import-wizard-loading">
              <div className="loading-spinner" />
              <p>Importing entries...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
