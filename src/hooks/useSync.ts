import { useEffect, useRef, useCallback } from 'react';

type SyncEventType = 'time-entries' | 'categories' | 'all';

interface SyncEvent {
  type: SyncEventType;
  timestamp: number;
  source: 'sse' | 'broadcast';
}

interface UseSyncOptions {
  onSync: (event: SyncEvent) => void;
  enabled?: boolean;
}

// BroadcastChannel for same-browser tab sync
const CHANNEL_NAME = 'chronoflow-sync';

/**
 * Hook for real-time data synchronization across tabs and devices.
 * Uses SSE for cross-device sync and BroadcastChannel for same-browser sync.
 */
export function useSync({ onSync, enabled = true }: UseSyncOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const lastEventTimestampRef = useRef<number>(0);

  // Debounce sync events to avoid duplicate refreshes
  const handleSyncEvent = useCallback((event: SyncEvent) => {
    // Ignore events that are too close together (within 500ms)
    const now = Date.now();
    if (now - lastEventTimestampRef.current < 500) {
      return;
    }
    lastEventTimestampRef.current = now;
    onSync(event);
  }, [onSync]);

  // Broadcast local changes to other tabs
  const broadcastChange = useCallback((type: SyncEventType) => {
    if (channelRef.current) {
      const event: SyncEvent = {
        type,
        timestamp: Date.now(),
        source: 'broadcast'
      };
      channelRef.current.postMessage(event);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Set up BroadcastChannel for same-browser sync
    if (typeof BroadcastChannel !== 'undefined') {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current.onmessage = (event: MessageEvent<SyncEvent>) => {
        handleSyncEvent(event.data);
      };
    }

    // Set up SSE for cross-device sync
    const connectSSE = () => {
      // Get auth headers
      const accessToken = localStorage.getItem('accessToken');
      const sessionId = localStorage.getItem('sessionId');
      
      if (!accessToken && !sessionId) {
        // No auth, skip SSE
        return;
      }

      // Build URL with auth params (SSE doesn't support custom headers easily)
      const params = new URLSearchParams();
      if (accessToken) {
        params.set('token', accessToken);
      } else if (sessionId) {
        params.set('sessionId', sessionId);
      }

      const url = `/api/sync?${params.toString()}`;
      
      try {
        eventSourceRef.current = new EventSource(url);

        eventSourceRef.current.addEventListener('sync', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            handleSyncEvent({
              type: data.type,
              timestamp: data.timestamp,
              source: 'sse'
            });
          } catch (e) {
            console.error('Failed to parse SSE sync event:', e);
          }
        });

        eventSourceRef.current.addEventListener('connected', () => {
          // SSE connected for real-time sync
        });

        eventSourceRef.current.onerror = () => {
          // Close and attempt reconnect
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          
          // Reconnect after 5 seconds
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connectSSE();
          }, 5000);
        };
      } catch (e) {
        console.error('Failed to connect SSE:', e);
      }
    };

    connectSSE();

    return () => {
      // Cleanup
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      eventSourceRef.current?.close();
      channelRef.current?.close();
    };
  }, [enabled, handleSyncEvent]);

  return { broadcastChange };
}
