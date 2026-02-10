import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSync } from '../useSync';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();
  
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }
  
  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  close() {
    const index = MockEventSource.instances.indexOf(this);
    if (index > -1) {
      MockEventSource.instances.splice(index, 1);
    }
  }
  
  // Helper to simulate events
  simulateEvent(type: string, data: unknown) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = { data: JSON.stringify(data) } as MessageEvent;
      listeners.forEach(listener => listener(event));
    }
  }
}

// Mock BroadcastChannel
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }
  
  postMessage(data: unknown) {
    // Simulate broadcast to other instances with same name
    MockBroadcastChannel.instances
      .filter(ch => ch !== this && ch.name === this.name)
      .forEach(ch => {
        if (ch.onmessage) {
          ch.onmessage({ data } as MessageEvent);
        }
      });
  }
  
  close() {
    const index = MockBroadcastChannel.instances.indexOf(this);
    if (index > -1) {
      MockBroadcastChannel.instances.splice(index, 1);
    }
  }
}

describe('useSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    MockBroadcastChannel.instances = [];
    (global as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
    (global as unknown as { BroadcastChannel: typeof MockBroadcastChannel }).BroadcastChannel = MockBroadcastChannel;
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates BroadcastChannel when enabled', () => {
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: true }));
    
    expect(MockBroadcastChannel.instances.length).toBe(1);
    expect(MockBroadcastChannel.instances[0].name).toBe('chronoflow-sync');
  });

  it('does not create connections when disabled', () => {
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: false }));
    
    expect(MockBroadcastChannel.instances.length).toBe(0);
    expect(MockEventSource.instances.length).toBe(0);
  });

  it('creates EventSource when access token is present', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return 'test-token';
      return null;
    });
    
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: true }));
    
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain('token=test-token');
  });

  it('creates EventSource when session ID is present', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'sessionId') return 'test-session';
      return null;
    });
    
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: true }));
    
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain('sessionId=test-session');
  });

  it('calls onSync when receiving SSE sync event', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return 'test-token';
      return null;
    });
    
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: true }));
    
    const eventSource = MockEventSource.instances[0];
    act(() => {
      eventSource.simulateEvent('sync', { type: 'time-entries', timestamp: Date.now() });
    });
    
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({
      type: 'time-entries',
      source: 'sse'
    }));
  });

  it('calls onSync when receiving BroadcastChannel message', () => {
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: true }));
    
    const channel = MockBroadcastChannel.instances[0];
    
    // Simulate message from another tab
    act(() => {
      if (channel.onmessage) {
        channel.onmessage({
          data: { type: 'categories', timestamp: Date.now(), source: 'broadcast' }
        } as MessageEvent);
      }
    });
    
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({
      type: 'categories',
      source: 'broadcast'
    }));
  });

  it('broadcastChange sends message to BroadcastChannel', () => {
    const onSync = vi.fn();
    const { result } = renderHook(() => useSync({ onSync, enabled: true }));
    
    const channel = MockBroadcastChannel.instances[0];
    const postMessageSpy = vi.spyOn(channel, 'postMessage');
    
    act(() => {
      result.current.broadcastChange('time-entries');
    });
    
    expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'time-entries',
      source: 'broadcast'
    }));
  });

  it('debounces rapid sync events', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return 'test-token';
      return null;
    });
    
    const onSync = vi.fn();
    renderHook(() => useSync({ onSync, enabled: true }));
    
    const eventSource = MockEventSource.instances[0];
    
    // Send multiple events rapidly
    act(() => {
      eventSource.simulateEvent('sync', { type: 'time-entries', timestamp: Date.now() });
      eventSource.simulateEvent('sync', { type: 'time-entries', timestamp: Date.now() });
      eventSource.simulateEvent('sync', { type: 'time-entries', timestamp: Date.now() });
    });
    
    // Only first event should trigger callback due to debouncing
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'accessToken') return 'test-token';
      return null;
    });
    
    const onSync = vi.fn();
    const { unmount } = renderHook(() => useSync({ onSync, enabled: true }));
    
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockBroadcastChannel.instances.length).toBe(1);
    
    unmount();
    
    expect(MockEventSource.instances.length).toBe(0);
    expect(MockBroadcastChannel.instances.length).toBe(0);
  });
});
