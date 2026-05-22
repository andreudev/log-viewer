import React, { useRef, useCallback, useState } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { computeDiff } from '../../domain/diff/computeDiff';
import { formatPayload } from '../../domain/formatting/formatPayload';
import { getLevelColor } from '../utils/constants';

interface CompareModalProps {
  compareQueue: LogEntry[];
  setCompareQueue: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  isCompareModalOpen: boolean;
  setIsCompareModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const CompareModal: React.FC<CompareModalProps> = ({
  compareQueue,
  setCompareQueue,
  isCompareModalOpen,
  setIsCompareModalOpen
}) => {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'payload' | 'metadata'>('payload');

  const handleLeftScroll = useCallback(() => {
    if (leftRef.current && rightRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
      rightRef.current.scrollLeft = leftRef.current.scrollLeft;
    }
  }, []);

  const handleRightScroll = useCallback(() => {
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
      leftRef.current.scrollLeft = rightRef.current.scrollLeft;
    }
  }, []);

  const renderMetaRow = (label: string, valA: any, valB: any) => {
    const isDifferent = valA !== valB;
    const statusBadge = isDifferent ? (
      <span style={{ color: '#ff7043', background: 'rgba(255, 112, 67, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>DIFERENTE</span>
    ) : (
      <span style={{ color: '#4caf50', background: 'rgba(78, 169, 78, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>IGUAL</span>
    );

    return (
      <tr key={label} style={{ background: isDifferent ? 'rgba(255, 112, 67, 0.03)' : 'transparent', transition: 'background 0.2s' }}>
        <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>{label}</td>
        <td style={{ 
          padding: '12px 16px', 
          fontSize: '12px', 
          color: isDifferent ? '#ff7043' : 'var(--text-primary)', 
          fontWeight: isDifferent ? 600 : 400,
          fontFamily: label.includes('ID') || label.includes('Hilo') ? 'monospace' : 'inherit',
          borderBottom: '1px solid var(--border-color)',
          wordBreak: 'break-all'
        }}>{String(valA || '-')}</td>
        <td style={{ 
          padding: '12px 16px', 
          fontSize: '12px', 
          color: isDifferent ? '#ff7043' : 'var(--text-primary)', 
          fontWeight: isDifferent ? 600 : 400,
          fontFamily: label.includes('ID') || label.includes('Hilo') ? 'monospace' : 'inherit',
          borderBottom: '1px solid var(--border-color)',
          wordBreak: 'break-all'
        }}>{String(valB || '-')}</td>
        <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{statusBadge}</td>
      </tr>
    );
  };

  if (compareQueue.length === 0) return null;

  return (
    <>
      {/* Floating Compare Bar */}
      <div className="floating-compare-bar">
        <div className="compare-bar-content">
          <span className="material-icons-round compare-bar-icon">compare_arrows</span>
          <span className="compare-bar-text">
            Comparar Logs: <b>{compareQueue.length}/2</b> seleccionados
          </span>
          <div className="compare-bar-items">
            {compareQueue.map(item => {
              const lc = getLevelColor(item.level);
              return (
                <span key={item.id} className="compare-pill">
                  #{item.id}{' '}
                  <span 
                    className="pinned-badge" 
                    style={{ 
                      color: `hsl(${lc})`, 
                      background: `hsla(${lc}, 0.1)` 
                    }}
                  >
                    {item.level}
                  </span>
                  <button 
                    className="remove-pill-btn" 
                    onClick={() => setCompareQueue(prev => prev.filter(c => c.id !== item.id))}
                  >
                    <span className="material-icons-round">close</span>
                  </button>
                </span>
              );
            })}
          </div>
          <div className="compare-bar-actions">
            <button 
              className="primary-button compact-btn compare-run-btn" 
              disabled={compareQueue.length < 2}
              onClick={() => setIsCompareModalOpen(true)}
              title={compareQueue.length < 2 ? "Selecciona 2 logs para comparar" : "Ver comparación lado a lado"}
            >
              <span className="material-icons-round">difference</span> Comparar
            </button>
            <button className="secondary-button compact-btn" onClick={() => setCompareQueue([])}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Synchronized Scroll Diff Modal */}
      {isCompareModalOpen && compareQueue.length === 2 && (
        <div className="compare-modal-overlay">
          <div className="compare-modal">
            <div className="compare-modal-header">
              <div className="compare-modal-title">
                <span className="material-icons-round">difference</span>
                <h2>Comparador Lado a Lado (v5.0)</h2>
              </div>
              <button className="icon-button" onClick={() => setIsCompareModalOpen(false)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>
            
            <div className="compare-modal-meta">
              <div className="compare-meta-left">
                <span className="meta-label">Log Izquierda (Log A)</span>
                <div className="compare-meta-val">
                  <span 
                    className="badge" 
                    style={{ 
                      color: `hsl(${getLevelColor(compareQueue[0].level)})`, 
                      background: `hsla(${getLevelColor(compareQueue[0].level)},0.1)` 
                    }}
                  >
                    {compareQueue[0].level}
                  </span>
                  <span>ID: <b>#{compareQueue[0].id}</b></span>
                  <span>• <b>{compareQueue[0].service}</b></span>
                </div>
              </div>
              
              <div className="compare-modal-meta-center">
                <span className="material-icons-round">swap_horiz</span>
              </div>
              
              <div className="compare-meta-right">
                <span className="meta-label">Log Derecha (Log B)</span>
                <div className="compare-meta-val">
                  <span 
                    className="badge" 
                    style={{ 
                      color: `hsl(${getLevelColor(compareQueue[1].level)})`, 
                      background: `hsla(${getLevelColor(compareQueue[1].level)},0.1)` 
                    }}
                  >
                    {compareQueue[1].level}
                  </span>
                  <span>ID: <b>#{compareQueue[1].id}</b></span>
                  <span>• <b>{compareQueue[1].service}</b></span>
                </div>
              </div>
            </div>

            {/* Tabs for comparison mode */}
            <div className="compare-tabs-row" style={{ 
              display: 'flex', 
              gap: '12px', 
              padding: '0 24px', 
              borderBottom: '1px solid var(--border-color)', 
              marginBottom: '16px' 
            }}>
              <button 
                type="button"
                className={`compare-tab-btn ${activeTab === 'payload' ? 'active' : ''}`}
                onClick={() => setActiveTab('payload')}
                style={{
                  padding: '10px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: activeTab === 'payload' ? 'var(--text-accent)' : 'var(--text-muted)',
                  border: 'none',
                  background: 'none',
                  borderBottom: activeTab === 'payload' ? '2px solid var(--text-accent)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '15px' }}>code</span>
                Comparar Payloads
              </button>
              <button 
                type="button"
                className={`compare-tab-btn ${activeTab === 'metadata' ? 'active' : ''}`}
                onClick={() => setActiveTab('metadata')}
                style={{
                  padding: '10px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: activeTab === 'metadata' ? 'var(--text-accent)' : 'var(--text-muted)',
                  border: 'none',
                  background: 'none',
                  borderBottom: activeTab === 'metadata' ? '2px solid var(--text-accent)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '15px' }}>list_alt</span>
                Cabeceras y Metadatos
              </button>
            </div>
            
            <div className="compare-modal-body">
              {activeTab === 'payload' ? (() => {
                const payloadA = formatPayload(compareQueue[0].message);
                const payloadB = formatPayload(compareQueue[1].message);
                const textA = payloadA.formatted || compareQueue[0].message;
                const textB = payloadB.formatted || compareQueue[1].message;
                const { left, right } = computeDiff(textA, textB);
                
                return (
                  <div className="diff-container">
                    <div 
                      className="diff-column diff-column-left" 
                      ref={leftRef} 
                      onScroll={handleLeftScroll}
                    >
                      <pre className="diff-pre">
                        {left.map((line, idx) => (
                          <div key={idx} className={`diff-line-wrapper diff-${line.type}`}>
                            <span className="diff-line-number">{line.value !== '' ? idx + 1 : ''}</span>
                            <span className="diff-line-sign">{line.type === 'removed' ? '-' : ' '}</span>
                            <span className="diff-line-content">{line.value}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                    
                    <div 
                      className="diff-column diff-column-right" 
                      ref={rightRef} 
                      onScroll={handleRightScroll}
                    >
                      <pre className="diff-pre">
                        {right.map((line, idx) => (
                          <div key={idx} className={`diff-line-wrapper diff-${line.type}`}>
                            <span className="diff-line-number">{line.value !== '' ? idx + 1 : ''}</span>
                            <span className="diff-line-sign">{line.type === 'added' ? '+' : ' '}</span>
                            <span className="diff-line-content">{line.value}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                  </div>
                );
              })() : (
                <div className="metadata-compare-container" style={{ 
                  padding: '20px', 
                  background: 'rgba(30, 34, 42, 0.65)', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-color)',
                  maxHeight: '450px',
                  overflowY: 'auto'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)', textTransform: 'uppercase' }}>Propiedad Metadato</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)', textTransform: 'uppercase' }}>Log A (Izquierda)</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)', textTransform: 'uppercase' }}>Log B (Derecha)</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)', textTransform: 'uppercase', textAlign: 'center' }}>Comparación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderMetaRow("Nivel de Log", compareQueue[0].level, compareQueue[1].level)}
                      {renderMetaRow("Marca de Tiempo", compareQueue[0].timestamp, compareQueue[1].timestamp)}
                      {renderMetaRow("Servicio / Endpoint", compareQueue[0].service, compareQueue[1].service)}
                      {renderMetaRow("ID de Correlación", compareQueue[0].correlationId, compareQueue[1].correlationId)}
                      {renderMetaRow("Clase / Origen", compareQueue[0].className, compareQueue[1].className)}
                      {renderMetaRow("Hilo de Ejecución", compareQueue[0].thread, compareQueue[1].thread)}
                      {renderMetaRow("Archivo de Origen", compareQueue[0].originFile, compareQueue[1].originFile)}
                      {renderMetaRow("Latencia (Delta)", compareQueue[0].deltaTimeMs !== undefined ? `${compareQueue[0].deltaTimeMs}ms` : 'N/A', compareQueue[1].deltaTimeMs !== undefined ? `${compareQueue[1].deltaTimeMs}ms` : 'N/A')}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
