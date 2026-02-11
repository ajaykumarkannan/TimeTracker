import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockResponse = {
  ok: boolean;
  status: number;
  json: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
};

const makeResponse = (status: number, body: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
  text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body))
});

const getStorage = () => window.localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

describe('api module', () => {
  beforeEach(() => {
    vi.resetModules();
    const storage = getStorage();
    storage.getItem.mockImplementation(() => null);
    storage.setItem.mockClear();
    storage.removeItem.mockClear();
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: vi.fn().mockReturnValue('uuid-123') },
      configurable: true
    });
  });

  it('manages tokens and stored user', async () => {
    const { setTokens, clearTokens, setStoredUser, getStoredUser, wasLoggedIn } = await import('../api');
    const storage = getStorage();

    setTokens('access-1', 'refresh-1');
    expect(storage.setItem).toHaveBeenCalledWith('accessToken', 'access-1');
    expect(storage.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-1');

    setStoredUser({ id: 1, email: 'user@example.com', name: 'User' });
    storage.getItem.mockImplementation((key) => (key === 'user' ? JSON.stringify({ id: 1, email: 'user@example.com', name: 'User' }) : null));

    expect(getStoredUser()).toEqual({ id: 1, email: 'user@example.com', name: 'User' });
    expect(wasLoggedIn()).toBe(true);

    clearTokens();
    expect(storage.removeItem).toHaveBeenCalledWith('accessToken');
    expect(storage.removeItem).toHaveBeenCalledWith('refreshToken');
    expect(storage.removeItem).toHaveBeenCalledWith('user');
  });

  it('registers and stores tokens on success', async () => {
    const { api } = await import('../api');
    const storage = getStorage();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const response = makeResponse(200, {
      user: { id: 1, email: 'new@example.com', name: 'New' },
      accessToken: 'access-2',
      refreshToken: 'refresh-2'
    });
    fetchMock.mockResolvedValue(response);

    const data = await api.register('new@example.com', 'New', 'password');
    expect(data.accessToken).toBe('access-2');
    expect(storage.setItem).toHaveBeenCalledWith('accessToken', 'access-2');
    expect(storage.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-2');
    expect(storage.setItem).toHaveBeenCalledWith('user', JSON.stringify({ id: 1, email: 'new@example.com', name: 'New' }));
  });

  it('throws when login fails', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockResolvedValue(makeResponse(401, { error: 'Login failed' }));

    await expect(api.login('a@b.com', 'bad')).rejects.toThrow('Login failed');
  });

  it('refreshes token after 401 and retries request', async () => {
    const { api, setTokens } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    setTokens('expired', 'refresh');

    fetchMock
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(200, {
        user: { id: 2, email: 'refresh@example.com', name: 'Refresh' },
        accessToken: 'access-3',
        refreshToken: 'refresh-3'
      }))
      .mockResolvedValueOnce(makeResponse(200, []));

    const categories = await api.getCategories();
    expect(categories).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('notifies when refresh fails', async () => {
    const { api, setTokens, onAuthStateChange } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const storage = getStorage();

    setTokens('expired', 'refresh');
    const listener = vi.fn();
    onAuthStateChange(listener);

    fetchMock
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(401, { error: 'Refresh failed' }));

    await expect(api.getCategories()).rejects.toThrow('Failed to fetch categories');
    expect(listener).toHaveBeenCalledWith('refresh_failed');
    expect(storage.removeItem).toHaveBeenCalledWith('accessToken');
  });

  it('logs out and clears tokens when authenticated', async () => {
    const { api, setTokens } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const storage = getStorage();

    setTokens('access', 'refresh');
    fetchMock.mockResolvedValue(makeResponse(200, {}));

    await api.logout();

    expect(storage.removeItem).toHaveBeenCalledWith('accessToken');
    expect(storage.removeItem).toHaveBeenCalledWith('refreshToken');
  });

  it('handles deleteCategory error response', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockResolvedValue(makeResponse(400, { error: 'Cannot delete' }));

    await expect(api.deleteCategory(1)).rejects.toThrow('Cannot delete');
  });

  it('attaches session ID header for guest requests', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const storage = getStorage();

    fetchMock.mockResolvedValue(makeResponse(200, []));

    await api.getCategories();

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers['X-Session-ID']).toBe('uuid-123');
    expect(storage.setItem).toHaveBeenCalledWith('sessionId', 'uuid-123');
  });

  it('attaches authorization header for logged in requests', async () => {
    const { api, setTokens } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    setTokens('access-token', 'refresh-token');
    fetchMock.mockResolvedValue(makeResponse(200, []));

    await api.getCategories();

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-token');
  });

  it('builds time entry and suggestion query parameters', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock
      .mockResolvedValueOnce(makeResponse(200, []))
      .mockResolvedValueOnce(makeResponse(200, []));

    await api.getTimeEntries('2026-02-01', '2026-02-02', 2, 'focus');
    await api.getTaskNameSuggestions(2, 'deep');

    expect(fetchMock.mock.calls[0][0]).toContain('startDate=2026-02-01');
    expect(fetchMock.mock.calls[0][0]).toContain('endDate=2026-02-02');
    expect(fetchMock.mock.calls[0][0]).toContain('categoryId=2');
    expect(fetchMock.mock.calls[0][0]).toContain('search=focus');

    expect(fetchMock.mock.calls[1][0]).toContain('categoryId=2');
    expect(fetchMock.mock.calls[1][0]).toContain('q=deep');
    expect(fetchMock.mock.calls[1][0]).toContain('limit=50');
  });

  it('throws for schedule stop and deleteEntriesByDate failures', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock
      .mockResolvedValueOnce(makeResponse(400, { error: 'Schedule failed' }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('bad json')),
        text: vi.fn().mockResolvedValue('')
      });

    await expect(api.scheduleStop(1, '2026-02-02T10:00:00.000Z')).rejects.toThrow('Schedule failed');
    await expect(api.deleteEntriesByDate('2026-02-02')).rejects.toThrow('Failed to delete entries');
  });

  it('handles export/import/preview and settings flows', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock
      .mockResolvedValueOnce(makeResponse(200, 'csv-data'))
      .mockResolvedValueOnce(makeResponse(200, { imported: 1, skipped: 0, errors: [] }))
      .mockResolvedValueOnce(makeResponse(200, { preview: [], headers: [] }))
      .mockResolvedValueOnce(makeResponse(200, { timezone: 'UTC' }))
      .mockResolvedValueOnce(makeResponse(200, { timezone: 'America/New_York' }));

    await expect(api.exportCSV()).resolves.toBe('csv-data');
    await expect(api.importCSV('csv')).resolves.toEqual({ imported: 1, skipped: 0, errors: [] });
    await expect(api.previewCSV('csv')).resolves.toEqual({ preview: [], headers: [] });
    await expect(api.getSettings()).resolves.toEqual({ timezone: 'UTC' });
    await expect(api.updateSettings({ timezone: 'America/New_York' })).resolves.toEqual({ timezone: 'America/New_York' });
  });

  it('handles analytics endpoints', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { summary: { totalMinutes: 0, totalEntries: 0, avgMinutesPerDay: 0, previousTotal: 0, change: 0 }, byCategory: [], daily: [], topTasks: [], period: { start: 'a', end: 'b' } }))
      .mockResolvedValueOnce(makeResponse(200, { category: { name: 'Focus', color: '#000', minutes: 0, count: 0 }, taskNames: [], pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 } }))
      .mockResolvedValueOnce(makeResponse(200, { taskNames: [], pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 } }))
      .mockResolvedValueOnce(makeResponse(200, { success: true, updatedCount: 1, oldTaskName: 'a', newTaskName: 'b', newCategoryId: 1 }));

    await api.getAnalytics('2026-01-01', '2026-02-01');
    await api.getCategoryDrilldown('Focus', '2026-01-01', '2026-02-01');
    await api.getTaskNames('2026-01-01', '2026-02-01');
    await api.updateTaskName('a', 'b', 1);
  });

  it('handles account conversion and password reset flows', async () => {
    const { api } = await import('../api');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const storage = getStorage();

    fetchMock
      .mockResolvedValueOnce(makeResponse(200, {
        user: { id: 3, email: 'converted@example.com', name: 'Converted' },
        accessToken: 'access-4',
        refreshToken: 'refresh-4'
      }))
      .mockResolvedValueOnce(makeResponse(200, { message: 'sent', resetToken: 'token-xyz' }))
      .mockResolvedValueOnce(makeResponse(200, {}));

    await api.convertGuestToAccount('converted@example.com', 'Converted', 'password');
    expect(storage.removeItem).toHaveBeenCalledWith('sessionId');

    await api.forgotPassword('converted@example.com');
    await api.resetPassword('token-xyz', 'new-password');
  });
});
