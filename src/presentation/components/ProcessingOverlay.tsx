import React from 'react';

interface ProcessingOverlayProps {
  isProcessing: boolean;
  progress: number;
  statusText: string;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  isProcessing,
  progress,
  statusText
}) => {
  if (!isProcessing) return null;

  return (
    <div className="processing-overlay">
      <div className="processing-glass-card animate-fade-in">
        <div className="processing-header">
          <div className="pulse-indicator">
            <span className="material-icons-round spinning-icon">sync</span>
          </div>
          <h2>Analizando Logs de Capa Media</h2>
        </div>
        
        <p className="processing-status-text">{statusText || 'Procesando en segundo plano...'}</p>
        
        <div className="progress-container">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="progress-footer">
          <span className="progress-percentage">{progress}%</span>
          <span className="worker-badge">
            <span className="material-icons-round" style={{ fontSize: '12px' }}>memory</span>
            Hilo Secundario (Worker)
          </span>
        </div>
      </div>
    </div>
  );
};
