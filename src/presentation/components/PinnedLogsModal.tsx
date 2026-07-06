import React from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { getLevelColor } from '../utils/constants';

interface PinnedLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedKeys: Set<string>;
  setPinnedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  parsedLogs: LogEntry[];
  setActiveLog: (log: LogEntry) => void;
  setIsDrawerOpen: (open: boolean) => void;
  togglePin: (log: LogEntry) => void;
}

export const PinnedLogsModal: React.FC<PinnedLogsModalProps> = ({
  isOpen,
  onClose,
  pinnedKeys,
  setPinnedKeys,
  parsedLogs,
  setActiveLog,
  setIsDrawerOpen,
  togglePin
}) => {
  if (!isOpen) return null;

  const handleClearAll = () => {
    if (window.confirm('¿Deseas desanclar todos los registros guardados?')) {
      setPinnedKeys(new Set());
      localStorage.removeItem('pinnedKeys');
    }
  };

  const handleItemClick = (log: LogEntry) => {
    setActiveLog(log);
    setIsDrawerOpen(true);
    onClose();
    setTimeout(() => {
      const row = document.getElementById(`log-row-${log.id}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 260 }} onClick={onClose}>
      <div 
        className="compare-modal" 
        style={{ 
          maxWidth: '700px', 
          maxHeight: '600px', 
          height: '75vh',
          width: '90vw'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round" style={{ color: 'var(--accent-solid)' }}>push_pin</span>
            <h2>Logs de Auditoría Fijados ({pinnedKeys.size})</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {pinnedKeys.size > 0 && (
              <button 
                className="secondary-button compact-btn"
                style={{ 
                  color: '#e06c75', 
                  border: '1px solid rgba(224,108,117,0.2)', 
                  background: 'rgba(224,108,117,0.06)',
                  padding: '4px 10px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onClick={handleClearAll}
                title="Desanclar todos los registros"
              >
                <span className="material-icons-round" style={{ fontSize: '13px' }}>delete_sweep</span>
                Limpiar Todos
              </button>
            )}
            <button className="icon-button" onClick={onClose} title="Cerrar Favoritos">
              <span className="material-icons-round">close</span>
            </button>
          </div>
        </div>

        {/* Modal Meta Bar */}
        <div className="compare-modal-meta" style={{ display: 'block', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Registros marcados con el icono de chincheta. Se guardan localmente en tu sesión para comparaciones rápidas y auditorías QA recurrentes.
          </p>
        </div>

        {/* Modal Body */}
        <div 
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            background: 'var(--bg-panel)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {pinnedKeys.size === 0 ? (
            <div 
              style={{ 
                padding: '40px 20px', 
                textAlign: 'center', 
                color: 'var(--text-muted)',
                fontSize: '13px',
                border: '2px dashed var(--border-color)',
                borderRadius: '8px',
                margin: 'auto 0'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '40px', opacity: 0.3, marginBottom: '8px', display: 'block' }}>push_pin</span>
              No has fijado ningún registro aún. Haz clic en el icono del pin en la tabla principal para marcar registros de interés.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from(pinnedKeys).map(key => {
                const [originFile, originalIdStr] = key.split('::');
                const originalId = parseInt(originalIdStr, 10);
                const log = parsedLogs.find(l => l.originFile === originFile && l.originalId === originalId);

                if (!log) {
                  return (
                    <div 
                      key={key} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'rgba(0,0,0,0.15)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        opacity: 0.6
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ARCHIVO DESACTIVADO / NO CARGADO</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{originFile}</span>
                      </div>
                      <button 
                        className="pinned-remove-btn" 
                        onClick={() => {
                          setPinnedKeys(prev => {
                            const next = new Set(prev);
                            next.delete(key);
                            localStorage.setItem('pinnedKeys', JSON.stringify(Array.from(next)));
                            return next;
                          });
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: 'none',
                          color: 'var(--text-primary)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                      </button>
                    </div>
                  );
                }

                const lc = getLevelColor(log.level || 'INFO');
                const timestamp = log.timestamp || '';
                return (
                  <div 
                    key={key}
                    onClick={() => handleItemClick(log)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.borderColor = 'var(--accent-solid)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span 
                          style={{ 
                            background: `hsla(${lc}, 0.12)`, 
                            color: `hsl(${lc})`,
                            fontSize: '9.5px',
                            fontWeight: 'bold',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase'
                          }}
                        >
                          {log.level}
                        </span>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {timestamp}
                        </span>
                        {log.originFile && (
                          <span 
                            style={{ 
                              fontSize: '9px', 
                              color: 'var(--text-secondary)',
                              background: 'rgba(255,255,255,0.06)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '120px'
                            }}
                            title={log.originFile}
                          >
                            {log.originFile}
                          </span>
                        )}
                      </div>
                      <div 
                        style={{ 
                          fontSize: '12px', 
                          color: 'var(--text-primary)', 
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: '2px'
                        }}
                      >
                        {log.message}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button 
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleItemClick(log);
                        }}
                        title="Ir al registro"
                        style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_forward</span>
                      </button>
                      <button 
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(log);
                        }}
                        title="Desanclar"
                        style={{ background: 'rgba(224,108,117,0.1)', color: '#e06c75', borderRadius: '6px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>
          <button className="secondary-button" onClick={onClose} style={{ padding: '8px 16px' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
