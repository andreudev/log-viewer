interface GlobalTailSocketState {
  ws: WebSocket | null;
  reconnectTimeout: any;
  currentFilename: string | null;
  onLineCallback: ((line: string) => void) | null;
  onErrorCallback: ((err: Event) => void) | null;
  shouldReconnect: boolean;
}

const g = typeof window !== 'undefined' ? (window as any) : {} as any;

if (typeof window !== 'undefined' && !g.__globalTailSocket__) {
  g.__globalTailSocket__ = {
    ws: null,
    reconnectTimeout: null,
    currentFilename: null,
    onLineCallback: null,
    onErrorCallback: null,
    shouldReconnect: true
  };
}

const state: GlobalTailSocketState = typeof window !== 'undefined'
  ? g.__globalTailSocket__
  : {
      ws: null,
      reconnectTimeout: null,
      currentFilename: null,
      onLineCallback: null,
      onErrorCallback: null,
      shouldReconnect: true
    };

/**
 * Establishes a WebSocket connection to tail log files in real-time.
 * 
 * @param filename Name of the log file in the logs directory.
 * @param onLineReceived Callback executed when a new line is received from the server.
 * @param onError Callback executed when a connection error occurs.
 * @param origin Source of the file ('local' or SSH connection ID).
 */
export function connectTail(
  filename: string,
  onLineReceived: (line: string) => void,
  onError: (err: Event) => void,
  origin = 'local'
) {
  // Tear down any existing connection
  disconnectTail();

  state.currentFilename = filename;
  state.onLineCallback = onLineReceived;
  state.onErrorCallback = onError;
  state.shouldReconnect = true;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const url = `${protocol}//${host}/ws/tail?filename=${encodeURIComponent(filename)}&origin=${encodeURIComponent(origin)}`;

  function establishConnection() {
    if (!state.shouldReconnect) return;

    console.log(`[WS-Client] Establishing WebSocket connection to: ${url}`);
    state.ws = new WebSocket(url);

    state.ws.onopen = () => {
      console.log(`[WS-Client] WebSocket connected for tailing: ${filename}`);
    };

    state.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'line' && state.onLineCallback) {
          state.onLineCallback(message.data);
        } else if (message.type === 'status') {
          console.log('[WS-Client] WebSocket status:', message);
        }
      } catch (err) {
        console.error('[WS-Client] Error parsing WebSocket message data:', err);
      }
    };

    state.ws.onerror = (event) => {
      console.error('[WS-Client] WebSocket error occurred:', event);
      if (state.onErrorCallback) {
        state.onErrorCallback(event);
      }
    };

    state.ws.onclose = (event) => {
      console.log(`[WS-Client] WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'No reason'}`);
      state.ws = null;

      // Reconnect automatically after 3 seconds if not intentionally closed
      if (state.shouldReconnect) {
        console.log('[WS-Client] Unexpected connection close. Retrying in 3 seconds...');
        state.reconnectTimeout = setTimeout(() => {
          establishConnection();
        }, 3000);
      }
    };
  }

  establishConnection();
}

/**
 * Disconnects the active WebSocket tail connection and clears any retry timers.
 */
export function disconnectTail() {
  state.shouldReconnect = false;

  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }

  if (state.ws) {
    // Standard normal closure code
    console.log('[WS-Client] Closing active WebSocket tail connection.');
    state.ws.close(1000, 'Tailing stopped by client');
    state.ws = null;
  }

  state.currentFilename = null;
  state.onLineCallback = null;
  state.onErrorCallback = null;
  console.log('[WS-Client] WebSocket tailing disconnected and cleaned up.');
}
