import { LogFileMeta } from './filesApi';

interface FilesSocketState {
  ws: WebSocket | null;
  reconnectTimeout: any;
  onFilesCallback: ((files: LogFileMeta[]) => void) | null;
  shouldReconnect: boolean;
}

const state: FilesSocketState = {
  ws: null,
  reconnectTimeout: null,
  onFilesCallback: null,
  shouldReconnect: true
};

export function connectFilesWatcher(
  onFilesReceived: (files: LogFileMeta[]) => void
) {
  state.onFilesCallback = onFilesReceived;
  state.shouldReconnect = true;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const url = `${protocol}//${host}/ws/files`;

  function establishConnection() {
    if (!state.shouldReconnect) return;

    console.log(`[WS-Files] Connecting to folder watcher: ${url}`);
    state.ws = new WebSocket(url);

    state.ws.onopen = () => {
      console.log(`[WS-Files] Folder watcher connected`);
    };

    state.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'files' && Array.isArray(message.data) && state.onFilesCallback) {
          state.onFilesCallback(message.data);
        }
      } catch (err) {
        console.error('[WS-Files] Error parsing message:', err);
      }
    };

    state.ws.onerror = (event) => {
      console.error('[WS-Files] WebSocket error:', event);
    };

    state.ws.onclose = () => {
      state.ws = null;
      if (state.shouldReconnect) {
        state.reconnectTimeout = setTimeout(() => {
          establishConnection();
        }, 5000);
      }
    };
  }

  establishConnection();
}

export function disconnectFilesWatcher() {
  state.shouldReconnect = false;
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }
  if (state.ws) {
    state.ws.close(1000, 'Stopped by client');
    state.ws = null;
  }
  state.onFilesCallback = null;
  console.log('[WS-Files] Folder watcher disconnected.');
}
