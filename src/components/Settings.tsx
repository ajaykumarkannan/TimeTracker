import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import './Settings.css';

interface SettingsProps {
  onLogout: () => void;
  onConvertSuccess: () => void;
}

export function Settings({ onLogout, onConvertSuccess }: SettingsProps) {
  const { user } = useAuth();
  const isGuest = !user;

  // Convert guest form
  const [convertEmail, setConvertEmail] = useState('');
  const [convertUsername, setConvertUsername] = useState('');
  const [convertPassword, setConvertPassword] = useState('');
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState('');

  // Account update form
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Export/Reset state
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setConvertLoading(true);
    setConvertError('');
    try {
      await api.convertGuestToAccount(convertEmail, convertUsername, convertPassword);
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
      const updates: { username?: string; email?: string; currentPassword?: string; newPassword?: string } = {};
      if (newUsername !== user?.username) updates.username = newUsername;
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
      await api.updateAccount(updates);
      setUpdateSuccess('Account updated successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Update failed');
    }
    setUpdateLoading(false);
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
              <label htmlFor="convert-username">Username</label>
              <input
                id="convert-username"
                type="text"
                value={convertUsername}
                onChange={e => setConvertUsername(e.target.value)}
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
              <label htmlFor="update-username">Username</label>
              <input
                id="update-username"
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
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

      {/* Data management */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Data Management</h2>
        </div>
        <div className="settings-actions">
          <div className="settings-action">
            <div className="action-info">
              <h3>Export Data</h3>
              <p>Download all your time entries and categories as JSON.</p>
            </div>
            <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
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
    </div>
  );
}
