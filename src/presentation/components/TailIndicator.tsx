import React from 'react';

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
}

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
  pausedLogsCount
}) => {
  if (!activeFilename) return null;

  return (
    <div className="tail-indicator-container glass-card">
      <div className="tail-status-section">
        <button
          onClick={onToggleTailing}
          className={`tail-toggle-btn ${isTailing ? 'active' : ''}`}
          title={isTailing ? "Desactivar Monitoreo en Vivo" : "Activar Monitoreo en Vivo"}
        >
          <span className={`live-pulse-dot ${isTailing && !isTailPaused ? 'pulsing' : ''}`} />
          <span className="live-text">{isTailing ? '● LIVE' : 'LIVE'}</span>
        </button>

        {isTailing && (
          <div className="tail-controls animate-fade-in">
            <div className="divider-vr" />
            
            <button
              onClick={onTogglePause}
              className={`tail-control-btn ${isTailPaused ? 'paused' : ''}`}
              title={isTailPaused ? "Reanudar Captura" : "Pausar Captura"}
            >
              <span className="material-icons-round">
                {isTailPaused ? 'play_arrow' : 'pause'}
              </span>
              <span className="btn-label">{isTailPaused ? 'Reanudar' : 'Pausar'}</span>
            </button>

            <button
              onClick={onToggleAutoScroll}
              className={`tail-control-btn ${autoScrollTail ? 'active' : ''}`}
              title="Desplazarse automáticamente al final al recibir nuevos logs"
            >
              <span className="material-icons-round">
                {autoScrollTail ? 'vertical_align_bottom' : 'vertical_align_center'}
              </span>
              <span className="btn-label">Auto-Scroll</span>
            </button>

            <div className="divider-vr" />
            
            {/* Selector de Ring Buffer Limit */}
            <div className="tail-buffer-wrapper">
              <span className="tail-buffer-label">Buffer:</span>
              <select
                value={tailBufferLimit}
                onChange={(e) => setTailBufferLimit(Number(e.target.value))}
                className="tail-buffer-select"
                title="Cantidad máxima de logs retenidos en memoria (Ring Buffer)"
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
        <span className={`tail-streaming-badge ${isTailPaused ? 'paused-warning' : 'animate-pulse'}`} style={{ color: isTailPaused ? '#e5c07b' : 'var(--text-secondary)' }}>
          {isTailPaused 
            ? `Monitoreo pausado${pausedLogsCount > 0 ? ` (+${pausedLogsCount} logs en cola)` : ''}` 
            : `Escuchando cambios en tiempo real: ${activeFilename}`}
        </span>
      )}
    </div>
  );
};

