import React, { useEffect, useRef, useState } from 'react';

// Estado del WS de tail que recibimos del socket.
// Replicamos el shape (no importamos para no acoplarnos).
export type TailStatus =
  | { state: 'connecting'; attempt: number }
  | { state: 'open'; receivedAt: number }
  | { state: 'reconnecting'; attempt: number; nextDelayMs: number; reason: string }
  | { state: 'error'; message: string; attempts: number }
  | { state: 'closed' };

interface TailIndicatorProps {
  isTailing: boolean;
  isTailPaused: boolean;
  autoScrollTail: boolean;
  onToggleTailing: () => void;
  onTogglePause: () => void;
  onToggleAutoScroll: () => void;
  activeFilename: string | null;
  tailBufferLimit: number;
  setTailBufferLimit: (limit: number) => void;
  pausedLogsCount: number;
  tailStatus?: TailStatus;
  /** Tick que cambia cada vez que el estado del WS se actualiza.
   * Usamos un counter en lugar del status para forzar re-render barato. */
  tailStatusTick?: number;
}

type VisualState = 'off' | 'connecting' | 'open' | 'paused' | 'reconnecting' | 'error' | 'closed';

function deriveVisualState(
  isTailing: boolean,
  isTailPaused: boolean,
  status?: TailStatus
): VisualState {
  if (!isTailing) return 'off';
  if (isTailPaused) return 'paused';
  if (!status || status.state === 'closed') return 'closed';
  if (status.state === 'connecting') return 'connecting';
  if (status.state === 'reconnecting') return 'reconnecting';
  if (status.state === 'error') return 'error';
  return 'open';
}

const STATE_META: Record<VisualState, { color: string; label: string; title: string; cls: string }> = {
  off: {
    color: '#6b7280',
    label: 'OFF',
    title: 'Live tail desactivado. Click para activar.',
    cls: 'state-off',
  },
  connecting: {
    color: '#fbbf24',
    label: 'CONECTANDO',
    title: 'Estableciendo conexion WebSocket con el server...',
    cls: 'state-connecting',
  },
  open: {
    color: '#22c55e',
    label: 'LIVE',
    title: 'Escuchando cambios en tiempo real.',
    cls: 'state-open',
  },
  paused: {
    color: '#eab308',
    label: 'PAUSADO',
    title: 'Los logs nuevos se acumulan en cola. Click en Reanudar para volcarlos.',
    cls: 'state-paused',
  },
  reconnecting: {
    color: '#fb923c',
    label: 'RECONECTANDO',
    title: 'Conexion perdida. Reintentando automaticamente con backoff exponencial.',
    cls: 'state-reconnecting',
  },
  error: {
    color: '#ef4444',
    label: 'ERROR',
    title: 'No se pudo reconectar tras varios intentos. Toggle OFF/ON para reintentar.',
    cls: 'state-error',
  },
  closed: {
    color: '#9ca3af',
    label: 'CERRADO',
    title: 'Sin conexion. Toggle OFF/ON para reabrir.',
    cls: 'state-closed',
  },
};

export const TailIndicator: React.FC<TailIndicatorProps> = ({
  isTailing,
  isTailPaused,
  autoScrollTail,
  onToggleTailing,
  onTogglePause,
  onToggleAutoScroll,
  activeFilename,
  tailBufferLimit,
  setTailBufferLimit,
  pausedLogsCount,
  tailStatus,
}) => {
  if (!activeFilename) return null;

  const visualState = deriveVisualState(isTailing, isTailPaused, tailStatus);
  const meta = STATE_META[visualState];

  // Health indicator: contar logs recibidos en los ultimos 60 segundos.
  // Usamos un ref porque no queremos re-renders por cada linea que llega;
  // solo queremos actualizar el contador cada 2s.
  const recentLogsRef = useRef<number[]>([]); // timestamps (ms) de las ultimas recepciones
  const [logsPerMin, setLogsPerMin] = useState<number>(0);

  // Conectar al estado del WS para detectar cuando llega una linea nueva.
  // Truco: cuando tailStatus pasa por 'open' con receivedAt actualizado,
  // sabemos que el server confirma que el canal esta vivo. Ademas, las
  // lineas del WS no actualizan tailStatus (solo errores/cambios de estado),
  // asi que medimos logsPerMin mirando la longitud de parsedLogs desde
  // fuera seria costoso. Alternativa: contar 'line' recibida -> emit
  // callback dedicado.
  //
  // Implementacion: usamos un evento custom 'logscope:tail-line' que el
  // socket dispara cada vez que llega una linea (sin acoplamiento fuerte).
  useEffect(() => {
    if (!isTailing) {
      recentLogsRef.current = [];
      setLogsPerMin(0);
      return;
    }
    const handler = () => {
      const now = Date.now();
      recentLogsRef.current.push(now);
      // Trim > 60s
      const cutoff = now - 60_000;
      recentLogsRef.current = recentLogsRef.current.filter(t => t >= cutoff);
    };
    window.addEventListener('logscope:tail-line', handler);
    const interval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 60_000;
      recentLogsRef.current = recentLogsRef.current.filter(t => t >= cutoff);
      setLogsPerMin(recentLogsRef.current.length);
    }, 2000);
    return () => {
      window.removeEventListener('logscope:tail-line', handler);
      clearInterval(interval);
    };
  }, [isTailing]);

  // Reintento restante para mostrar countdown en 'reconnecting'
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
  useEffect(() => {
    if (tailStatus?.state !== 'reconnecting') {
      setReconnectCountdown(0);
      return;
    }
    const total = tailStatus.nextDelayMs;
    const start = Date.now();
    setReconnectCountdown(Math.ceil(total / 1000));
    const t = setInterval(() => {
      const remaining = total - (Date.now() - start);
      setReconnectCountdown(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [tailStatus]);

  return (
    <div className="tail-indicator-container glass-card">
      <div className="tail-status-section">
        <button
          onClick={onToggleTailing}
          className={`tail-toggle-btn ${meta.cls}`}
          title={meta.title}
          aria-label={meta.title}
          style={{
            '--state-color': meta.color,
          } as React.CSSProperties}
        >
          <span
            className={`live-pulse-dot ${
              visualState === 'open' ? 'pulsing' :
              visualState === 'connecting' || visualState === 'reconnecting' ? 'spinning' :
              ''
            }`}
            aria-hidden="true"
          />
          <span className="live-text">{meta.label}</span>
          {visualState === 'reconnecting' && reconnectCountdown > 0 && (
            <span className="reconnect-badge">{reconnectCountdown}s</span>
          )}
        </button>

        {isTailing && (
          <div className="tail-controls animate-fade-in">
            <div className="divider-vr" />

            <button
              onClick={onTogglePause}
              className={`tail-control-btn ${isTailPaused ? 'paused' : ''}`}
              title={isTailPaused ? 'Reanudar Captura' : 'Pausar Captura'}
              aria-label={isTailPaused ? 'Reanudar Captura' : 'Pausar Captura'}
            >
              <span className="material-icons-round">
                {isTailPaused ? 'play_arrow' : 'pause'}
              </span>
              <span className="btn-label">{isTailPaused ? 'Reanudar' : 'Pausar'}</span>
            </button>

            <button
              onClick={onToggleAutoScroll}
              className={`tail-control-btn ${autoScrollTail ? 'active' : ''}`}
              title="Desplazarse automaticamente al final al recibir nuevos logs"
              aria-label="Auto-scroll"
            >
              <span className="material-icons-round">
                {autoScrollTail ? 'vertical_align_bottom' : 'vertical_align_center'}
              </span>
              <span className="btn-label">Auto-Scroll</span>
            </button>

            <div className="divider-vr" />

            <div className="tail-buffer-wrapper">
              <span className="tail-buffer-label">Buffer:</span>
              <select
                value={tailBufferLimit}
                onChange={(e) => setTailBufferLimit(Number(e.target.value))}
                className="tail-buffer-select"
                title="Cantidad maxima de logs retenidos en memoria (Ring Buffer)"
                aria-label="Tamano del ring buffer"
              >
                <option value={1000}>1K logs</option>
                <option value={5000}>5K logs</option>
                <option value={10000}>10K logs</option>
                <option value={25000}>25K logs</option>
                <option value={50000}>50K logs</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {isTailing && (
        <div className="tail-meta-row">
          <span className={`tail-streaming-badge ${isTailPaused ? 'paused-warning' : ''}`}>
            {isTailPaused
              ? `Monitoreo pausado${pausedLogsCount > 0 ? ` (+${pausedLogsCount} logs en cola)` : ''}`
              : visualState === 'reconnecting'
                ? `Conexion perdida: ${(tailStatus as any)?.reason ?? ''}. Reintentando...`
                : visualState === 'error'
                  ? (tailStatus as any)?.message ?? 'Error de conexion'
                  : `Escuchando: ${activeFilename}`}
          </span>

          {/* Health indicator: logs/min en los ultimos 60s */}
          {visualState === 'open' && (
            <span
              className="tail-rate-badge"
              title="Logs recibidos en los ultimos 60 segundos"
              aria-label={`${logsPerMin} logs por minuto`}
            >
              <span className="material-icons-round" aria-hidden="true">speed</span>
              <span>{logsPerMin}/min</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};