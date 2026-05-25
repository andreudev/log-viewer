import React from 'react';

interface TailIndicatorProps {
  isTailing: boolean;
  isTailPaused: boolean;
  autoScrollTail: boolean;
  onToggleTailing: () => void;
  onTogglePause: () => void;
  onToggleAutoScroll: () => void;
  activeFilename: string | null;
}

export const TailIndicator: React.FC<TailIndicatorProps> = ({
  isTailing,
  isTailPaused,
  autoScrollTail,
  onToggleTailing,
  onTogglePause,
  onToggleAutoScroll,
  activeFilename
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
              <span className="btn-label">{isTailPaused ? (isTailPaused ? 'Reanudar' : 'Pausa') : 'Pausar'}</span>
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
          </div>
        )}
      </div>
      
      {isTailing && (
        <span className="tail-streaming-badge animate-pulse">
          {isTailPaused 
            ? 'Monitoreo pausado' 
            : `Escuchando cambios en tiempo real: ${activeFilename}`}
        </span>
      )}
    </div>
  );
};
