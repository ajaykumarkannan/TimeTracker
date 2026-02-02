import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { api } from '../api';
import { ImportWizard } from './ImportWizard';
import './Settings.css';

interface SettingsProps {
  onLogout: () => void;
  onConvertSuccess: () => void;
}

// Common timezones for quick selection
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC'
];

export function Settings({ onLogout, onConvertSuccess }: SettingsProps) {
  const { user, updateUser } = useAuth();
  const { timezone, setTimezone } = useTimezone();
  const isGuest = !user;

  // Convert guest form
  const [convertEmail, setConvertEmail] = useState('');
  const [convertName, setConvertName] = useState('');
  const [convertPassword, setConvertPassword] = useState('');
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState('');

  // Account update form
  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Timezone state
  const [timezoneLoading, setTimezoneLoading] = useState(false);

  // Export/Reset state
  const [exportingCSV, setExportingCSV] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importCSV, setImportCSV] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importError, setImportError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setConvertLoading(true);
    setConvertError('');
    try {
      await api.convertGuestToAccount(convertEmail, convertName, convertPassword);
      onConvertSuccess();
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Conversion failed');
    }
    setConvertLoading(false);
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateLoading(true);
    setUpdateError('');
    setUpdateSuccess('');
    try {
      const updates: { name?: string; email?: string; currentPassword?: string; newPassword?: string } = {};
      if (newName !== user?.name) updates.name = newName;
      if (newEmail !== user?.email) updates.email = newEmail;
      if (newPassword) {
        updates.currentPassword = currentPassword;
        updates.newPassword = newPassword;
      }
      if (Object.keys(updates).length === 0) {
        setUpdateError('No changes to save');
        setUpdateLoading(false);
        return;
      }
      const updatedUser = await api.updateAccount(updates);
      updateUser(updatedUser);
      setNewName(updatedUser.name || '');
      setNewEmail(updatedUser.email || '');
      setUpdateSuccess('Account updated successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Update failed');
    }
    setUpdateLoading(false);
  };

  const handleExportCSV = async () => {
    setExportingCSV(true);
    try {
      const csv = await api.exportCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronoflow-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export failed:', error);
    }
    setExportingCSV(false);
  };

  const handleImportCSVFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportResult(null);

    try {
      const csv = await file.text();
      setImportCSV(csv);
      setShowImportWizard(true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to read file');
    }
    // Reset file input
    e.target.value = '';
  };

  const handleImportSuccess = (result: { imported: number; skipped: number; errors: string[] }) => {
    setImportResult(result);
    setShowImportWizard(false);
    setImportCSV(null);
  };

  const handleImportClose = () => {
    setShowImportWizard(false);
    setImportCSV(null);
  };

  const handleTimezoneChange = async (tz: string) => {
    setTimezoneLoading(true);
    try {
      await setTimezone(tz);
    } catch (error) {
      console.error('Failed to update timezone:', error);
    }
    setTimezoneLoading(false);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetAllData();
      setShowResetConfirm(false);
      window.location.reload();
    } catch (error) {
      console.error('Reset failed:', error);
    }
    setResetting(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      onLogout();
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setDeleting(false);
  };

  return (
    <div className="settings">
      {/* Guest conversion */}
      {isGuest && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Create Account</h2>
          </div>
          <p className="settings-description">
            Convert your guest session to a full account. Your existing data will be preserved.
          </p>
          <form onSubmit={handleConvert} className="settings-form">
            <div className="form-group">
              <label htmlFor="convert-email">Email</label>
              <input
                id="convert-email"
                type="email"
                value={convertEmail}
                onChange={e => setConvertEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="convert-name">Name</label>
              <input
                id="convert-name"
                type="text"
                value={convertName}
                onChange={e => setConvertName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="convert-password">Password</label>
              <input
                id="convert-password"
                type="password"
                value={convertPassword}
                onChange={e => setConvertPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            {convertError && <div className="form-error">{convertError}</div>}
            <button type="submit" className="btn-primary" disabled={convertLoading}>
              {convertLoading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </div>
      )}

      {/* Account settings for logged-in users */}
      {!isGuest && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Account Settings</h2>
          </div>
          <form onSubmit={handleUpdateAccount} className="settings-form">
            <div className="form-group">
              <label htmlFor="update-name">Name</label>
              <input
                id="update-name"
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="update-email">Email</label>
              <input
                id="update-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
              />
            </div>
            <div className="form-divider">Change Password</div>
            <div className="form-group">
              <label htmlFor="current-password">Current Password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                minLength={6}
              />
            </div>
            {updateError && <div className="form-error">{updateError}</div>}
            {updateSuccess && <div className="form-success">{updateSuccess}</div>}
            <button type="submit" className="btn-primary" disabled={updateLoading}>
              {updateLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* Timezone settings */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Timezone</h2>
        </div>
        <div className="settings-form">
          <div className="form-group">
            <label htmlFor="timezone-select">Display Timezone</label>
            <select
              id="timezone-select"
              value={timezone}
              onChange={e => handleTimezoneChange(e.target.value)}
              disabled={timezoneLoading}
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <p className="form-hint">Times will be displayed in this timezone.</p>
          </div>
        </div>
      </div>

      {/* Data management */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Data Management</h2>
        </div>
        <div className="settings-actions">
          <div className="settings-action">
            <div className="action-info">
              <h3>Export as CSV</h3>
              <p>Download your time entries as a CSV file for use in spreadsheets.</p>
            </div>
            <button className="btn-secondary" onClick={handleExportCSV} disabled={exportingCSV}>
              {exportingCSV ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          <div className="settings-action">
            <div className="action-info">
              <h3>Import from CSV</h3>
              <p>Import time entries from a CSV file. Map columns and review before importing.</p>
            </div>
            <label className="btn-secondary import-btn">
              Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSVFile}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          {importResult && (
            <div className="import-result">
              <p className="import-success">
                Imported {importResult.imported} entries{importResult.skipped > 0 && `, skipped ${importResult.skipped}`}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="import-errors">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {importError && <div className="form-error">{importError}</div>}
          <div className="settings-action danger">
            <div className="action-info">
              <h3>Reset All Data</h3>
              <p>Delete all time entries and reset categories to defaults.</p>
            </div>
            {!showResetConfirm ? (
              <button className="btn-danger" onClick={() => setShowResetConfirm(true)}>
                Reset
              </button>
            ) : (
              <div className="confirm-buttons">
                <button className="btn-danger" onClick={handleReset} disabled={resetting}>
                  {resetting ? 'Resetting...' : 'Confirm Reset'}
                </button>
                <button className="btn-secondary" onClick={() => setShowResetConfirm(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger zone for registered users */}
      {!isGuest && (
        <div className="card danger-zone">
          <div className="card-header">
            <h2 className="card-title">Danger Zone</h2>
          </div>
          <div className="settings-actions">
            <div className="settings-action danger">
              <div className="action-info">
                <h3>Delete Account</h3>
                <p>Permanently delete your account and all associated data.</p>
              </div>
              {!showDeleteConfirm ? (
                <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                  Delete Account
                </button>
              ) : (
                <div className="confirm-buttons">
                  <button className="btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import Wizard Modal */}
      {showImportWizard && importCSV && (
        <ImportWizard
          csv={importCSV}
          onClose={handleImportClose}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}
