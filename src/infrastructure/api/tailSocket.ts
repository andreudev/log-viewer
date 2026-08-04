// Multiplexed WebSocket tail: allows watching multiple (filename, origin) pairs
// simultaneously. Each pair owns its own WebSocket, callbacks and reconnect timer.
//
// Resilience features added:
// - Status callback (connecting/open/reconnecting/error/closed) so the UI can
//   render the LIVE button in the right state.
// - Exponential backoff on reconnect (1s, 2s, 4s, 8s, capped at 30s) instead
//   of a fixed 3s. After 5 failed attempts the channel goes to "error" state
//   and stops hammering the server.
// - Heartbeat: client pings every 25s; if the server doesn't pong within 10s
//   the socket is considered dead and we force a reconnect.
// - On normal close (code 1000) we don't reconnect — that means the user
//   toggled tail off or the server cleanly closed us.

type LineCallback = (line: string) => void;
type StatusCallback = (status: TailStatus) => void;
type ErrorCallback = (err: Event) => void;

export type TailStatus =
  | { state: 'connecting'; attempt: number }
  | { state: 'open'; receivedAt: number }
  | { state: 'reconnecting'; attempt: number; nextDelayMs: number; reason: string }
  | { state: 'error'; message: string; attempts: number }
  | { state: 'closed' };

interface TailChannel {
  key: string;            // `${origin}::${filename}`
  filename: string;
  origin: string;
  ws: WebSocket | null;
  reconnectTimeout: any;
  reconnectAttempt: number;
  heartbeatTimer: any;
  heartbeatTimeout: any;
  lastPongAt: number;
  onLine: LineCallback;
  onError: ErrorCallback | null;
  onStatus: StatusCallback | null;
  closed: boolean;        // true once disconnect() is called - prevents reconnect
  // Backoff state
  lastCloseReason: string;
}

const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 8; // ~ 1+2+4+8+16+30+30+30 = 121s antes de "error"

const g = (typeof window !== 'undefined' ? (window as any) : {}) as any;

if (typeof window !== 'undefined' && !g.__globalTailChannels__) {
  g.__globalTailChannels__ = new Map<string, TailChannel>();
}

const channels: Map<string, TailChannel> = typeof window !== 'undefined'
  ? g.__globalTailChannels__
  : new Map<string, TailChannel>();

function makeKey(filename: string, origin: string): string {
  return `${origin}::${filename}`;
}

function emitStatus(ch: TailChannel, status: TailStatus) {
  if (ch.onStatus) {
    try {
      ch.onStatus(status);
    } catch (e) {
      console.error(`[WS-Client] onStatus callback threw for ${ch.key}:`, e);
    }
  }
}

function clearHeartbeat(ch: TailChannel) {
  if (ch.heartbeatTimer) {
    clearInterval(ch.heartbeatTimer);
    ch.heartbeatTimer = null;
  }
  if (ch.heartbeatTimeout) {
    clearTimeout(ch.heartbeatTimeout);
    ch.heartbeatTimeout = null;
  }
}

function startHeartbeat(ch: TailChannel) {
  clearHeartbeat(ch);
  ch.lastPongAt = Date.now();
  ch.heartbeatTimer = setInterval(() => {
    if (!ch.ws || ch.ws.readyState !== WebSocket.OPEN) return;
    // El servidor Node no implementa ping/pong WS nativo (sin ws lib upgrade),
    // asi que usamos un mensaje JSON {type:'ping'} como heartbeat de aplicacion.
    // Si el server no responde en HEARTBEAT_TIMEOUT_MS, morimos el socket.
    try {
      ch.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
    } catch (_) {
      // socket ya muerto
    }
    ch.heartbeatTimeout = setTimeout(() => {
      if (Date.now() - ch.lastPongAt > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        console.warn(`[WS-Client] Heartbeat timeout for ${ch.key}, forcing reconnect`);
        if (ch.ws) {
          try { ch.ws.close(4000, 'Heartbeat timeout'); } catch (_) { /* noop */ }
        }
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);
}

function startChannel(channel: TailChannel): void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const url = `${protocol}//${host}/ws/tail?filename=${encodeURIComponent(channel.filename)}&origin=${encodeURIComponent(channel.origin)}`;

  const attempt = channel.reconnectAttempt + 1;
  emitStatus(channel, { state: 'connecting', attempt });

  console.log(`[WS-Client] Opening tail channel ${channel.key} (attempt ${attempt}) -> ${url}`);
  channel.ws = new WebSocket(url);

  channel.ws.onopen = () => {
    console.log(`[WS-Client] Tail channel ${channel.key} connected`);
    channel.reconnectAttempt = 0;
    emitStatus(channel, { state: 'open', receivedAt: Date.now() });
    startHeartbeat(channel);
  };

  channel.ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'line') {
        channel.onLine(message.data);
        // Emitir evento custom para health indicators (logs/min).
        // No usamos setState para no acoplar el socket con React.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('logscope:tail-line'));
        }
      } else if (message.type === 'status') {
        console.log(`[WS-Client] Tail ${channel.key} status:`, message);
      } else if (message.type === 'pong') {
        channel.lastPongAt = Date.now();
      }
    } catch (err) {
      console.error(`[WS-Client] Tail ${channel.key} parse error:`, err);
    }
  };

  channel.ws.onerror = (event) => {
    console.error(`[WS-Client] Tail ${channel.key} error:`, event);
    if (channel.onError) channel.onError(event);
  };

  channel.ws.onclose = (event) => {
    console.log(`[WS-Client] Tail ${channel.key} closed (${event.code} ${event.reason})`);
    clearHeartbeat(channel);
    channel.ws = null;
    channel.lastCloseReason = event.reason || `code ${event.code}`;

    if (channel.closed) {
      // Usuario apagó el tail intencionalmente
      emitStatus(channel, { state: 'closed' });
      return;
    }

    // Cierre normal del server (1000) = tail terminó, no reconectar
    if (event.code === 1000 && event.reason !== 'Heartbeat timeout') {
      emitStatus(channel, { state: 'closed' });
      return;
    }

    // Reconectar con backoff exponencial
    channel.reconnectAttempt++;
    if (channel.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
      emitStatus(channel, {
        state: 'error',
        message: `No se pudo reconectar tras ${MAX_RECONNECT_ATTEMPTS} intentos. Revisa que el archivo aún exista y el server esté vivo.`,
        attempts: channel.reconnectAttempt,
      });
      return;
    }

    const delayMs = Math.min(
      BACKOFF_INITIAL_MS * Math.pow(BACKOFF_MULTIPLIER, channel.reconnectAttempt - 1),
      BACKOFF_MAX_MS
    );
    const reason = event.reason || `code ${event.code}`;
    emitStatus(channel, {
      state: 'reconnecting',
      attempt: channel.reconnectAttempt,
      nextDelayMs: delayMs,
      reason,
    });
    channel.reconnectTimeout = setTimeout(() => startChannel(channel), delayMs);
  };
}

/**
 * Subscribe to a tail stream for (filename, origin). Multiple subscriptions
 * with different keys can run simultaneously. Calling again with the same key
 * just replaces the line + status callbacks.
 */
export function connectTail(
  filename: string,
  onLineReceived: LineCallback,
  onError: ErrorCallback,
  origin = 'local',
  onStatus: StatusCallback | null = null
) {
  const key = makeKey(filename, origin);
  const existing = channels.get(key);

  if (existing) {
    // Same channel - just refresh callbacks. Do not tear down the WS.
    existing.onLine = onLineReceived;
    existing.onError = onError;
    existing.onStatus = onStatus;
    existing.closed = false;
    console.log(`[WS-Client] Reusing tail channel ${key}`);
    // Si el canal ya está abierto, emite estado actual
    if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
      emitStatus(existing, { state: 'open', receivedAt: Date.now() });
    }
    return;
  }

  const channel: TailChannel = {
    key,
    filename,
    origin,
    ws: null,
    reconnectTimeout: null,
    reconnectAttempt: 0,
    heartbeatTimer: null,
    heartbeatTimeout: null,
    lastPongAt: 0,
    onLine: onLineReceived,
    onError,
    onStatus,
    closed: false,
    lastCloseReason: '',
  };

  channels.set(key, channel);
  startChannel(channel);
}

/**
 * Disconnect a specific (filename, origin) channel. If called with no args,
 * disconnects every active channel (used when the user toggles tail off).
 */
export function disconnectTail(filename?: string, origin?: string) {
  if (filename === undefined) {
    // Disconnect everything
    for (const ch of Array.from(channels.values())) {
      tearDownChannel(ch);
    }
    channels.clear();
    console.log('[WS-Client] All tail channels disconnected');
    return;
  }

  const key = makeKey(filename, origin || 'local');
  const ch = channels.get(key);
  if (ch) {
    tearDownChannel(ch);
    channels.delete(key);
  }
}

function tearDownChannel(ch: TailChannel) {
  ch.closed = true;
  if (ch.reconnectTimeout) {
    clearTimeout(ch.reconnectTimeout);
    ch.reconnectTimeout = null;
  }
  clearHeartbeat(ch);
  if (ch.ws) {
    try { ch.ws.close(1000, 'Tailing stopped by client'); } catch (_) { /* noop */ }
    ch.ws = null;
  }
  emitStatus(ch, { state: 'closed' });
}

/**
 * Returns the list of currently active tail keys (origin::filename).
 */
export function activeTailKeys(): string[] {
  return Array.from(channels.keys());
}