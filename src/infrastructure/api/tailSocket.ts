// Multiplexed WebSocket tail: allows watching multiple (filename, origin) pairs
// simultaneously. Each pair owns its own WebSocket, callbacks and reconnect timer.

type LineCallback = (line: string) => void;
type ErrorCallback = (err: Event) => void;

interface TailChannel {
  key: string;            // `${origin}::${filename}`
  filename: string;
  origin: string;
  ws: WebSocket | null;
  reconnectTimeout: any;
  onLine: LineCallback;
  onError: ErrorCallback | null;
  closed: boolean;        // true once disconnect() is called - prevents reconnect
}

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

function startChannel(channel: TailChannel): void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const url = `${protocol}//${host}/ws/tail?filename=${encodeURIComponent(channel.filename)}&origin=${encodeURIComponent(channel.origin)}`;

  console.log(`[WS-Client] Opening tail channel ${channel.key} -> ${url}`);
  channel.ws = new WebSocket(url);

  channel.ws.onopen = () => {
    console.log(`[WS-Client] Tail channel ${channel.key} connected`);
  };

  channel.ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'line') {
        channel.onLine(message.data);
      } else if (message.type === 'status') {
        console.log(`[WS-Client] Tail ${channel.key} status:`, message);
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
    console.log(`[WS-Client] Tail ${channel.key} closed (${event.code})`);
    channel.ws = null;
    if (!channel.closed) {
      channel.reconnectTimeout = setTimeout(() => startChannel(channel), 3000);
    }
  };
}

/**
 * Subscribe to a tail stream for (filename, origin). Multiple subscriptions
 * with different keys can run simultaneously. Calling again with the same key
 * just replaces the line callback.
 */
export function connectTail(
  filename: string,
  onLineReceived: LineCallback,
  onError: ErrorCallback,
  origin = 'local'
) {
  const key = makeKey(filename, origin);
  const existing = channels.get(key);

  if (existing) {
    // Same channel - just refresh callbacks. Do not tear down the WS.
    existing.onLine = onLineReceived;
    existing.onError = onError;
    existing.closed = false;
    console.log(`[WS-Client] Reusing tail channel ${key}`);
    return;
  }

  const channel: TailChannel = {
    key,
    filename,
    origin,
    ws: null,
    reconnectTimeout: null,
    onLine: onLineReceived,
    onError,
    closed: false,
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
  if (ch.ws) {
    try { ch.ws.close(1000, 'Tailing stopped by client'); } catch (_) { /* noop */ }
    ch.ws = null;
  }
}

/**
 * Returns the list of currently active tail keys (origin::filename).
 */
export function activeTailKeys(): string[] {
  return Array.from(channels.keys());
}
