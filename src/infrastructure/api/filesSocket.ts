import { LogFileMeta } from './filesApi';

interface FilesSocketState {
  ws: WebSocket | null;
  reconnectTimeout: any;
  reconnectAttempt: number;
  onFilesCallback: ((files: LogFileMeta[]) => void) | null;
  shouldReconnect: boolean;
  url: string | null;
  // True cuando connectFilesWatcher fue llamado pero todavia no abrimos WS
  pending: boolean;
}

const state: FilesSocketState = {
  ws: null,
  reconnectTimeout: null,
  reconnectAttempt: 0,
  onFilesCallback: null,
  shouldReconnect: true,
  url: null,
  pending: false,
};

// Backoff igual que tailSocket.ts para consistencia.
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 8;

function clearReconnectTimeout() {
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }
}

function establishConnection(): void {
  if (!state.shouldReconnect) return;
  if (!state.url) return;
  if (state.ws) {
    // Ya hay un WS abierto o conectandose. Idempotente: no abrir otro.
    // Esto resuelve el loop en React 18 StrictMode (mount/unmount/mount)
    // y en re-renders donde connectFilesWatcher se llama multiples veces.
    return;
  }

  const attempt = state.reconnectAttempt + 1;
  console.log(`[WS-Files] Connecting to folder watcher (attempt ${attempt}): ${state.url}`);
  state.ws = new WebSocket(state.url);

  state.ws.onopen = () => {
    console.log(`[WS-Files] Folder watcher connected`);
    state.reconnectAttempt = 0;
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
    if (!state.shouldReconnect) return;

    state.reconnectAttempt++;
    if (state.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[WS-Files] Giving up after ${MAX_RECONNECT_ATTEMPTS} failed attempts. ` +
        `Likely the backend server (puerto 3000) is not running.`
      );
      return;
    }

    const delay = Math.min(
      BACKOFF_INITIAL_MS * Math.pow(BACKOFF_MULTIPLIER, state.reconnectAttempt - 1),
      BACKOFF_MAX_MS
    );
    console.log(`[WS-Files] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempt})`);
    state.reconnectTimeout = setTimeout(() => establishConnection(), delay);
  };
}

export function connectFilesWatcher(
  onFilesReceived: (files: LogFileMeta[]) => void
) {
  state.onFilesCallback = onFilesReceived;
  state.shouldReconnect = true;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const url = `${protocol}//${host}/ws/files`;

  // Si la URL no cambio y ya hay un socket activo, no hacer nada.
  // Esto evita el reconnect-loop cuando React 18 StrictMode ejecuta el
  // effect dos veces seguidas en dev (mount/unmount/mount).
  if (state.url === url && (state.ws || state.reconnectTimeout)) {
    console.log('[WS-Files] Reusing existing folder watcher connection');
    return;
  }

  // Si la URL cambio (ej: port forwarding, redirect), cerrar el viejo y abrir uno nuevo.
  if (state.url && state.url !== url && state.ws) {
    try { state.ws.close(1000, 'URL changed'); } catch (_) { /* noop */ }
    state.ws = null;
  }

  state.url = url;
  state.pending = true;
  establishConnection();
  state.pending = false;
}

export function disconnectFilesWatcher() {
  state.shouldReconnect = false;
  clearReconnectTimeout();
  if (state.ws) {
    try { state.ws.close(1000, 'Stopped by client'); } catch (_) { /* noop */ }
    state.ws = null;
  }
  state.onFilesCallback = null;
  console.log('[WS-Files] Folder watcher disconnected.');
}

/**
 * Returns true if there is an active or pending folder watcher connection.
 * Util para debugging.
 */
export function isFilesWatcherActive(): boolean {
  return state.shouldReconnect && (state.ws !== null || state.reconnectTimeout !== null);
}