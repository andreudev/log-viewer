import React, { useMemo, useState, useRef } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { computeDiff } from '../../domain/diff/computeDiff';
import { LogViewerState } from '../hooks/useLogViewerState';

interface SessionDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSplitMode: boolean;
  setIsSplitMode: (val: boolean) => void;
  leftState: LogViewerState;
  rightState: LogViewerState;
}

type TabType = 'metrics' | 'diff';

export const SessionDiffModal: React.FC<SessionDiffModalProps> = ({
  isOpen,
  onClose,
  isSplitMode,
  setIsSplitMode,
  leftState,
  rightState
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('metrics');

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const handleLeftScroll = () => {
    if (leftScrollRef.current && rightScrollRef.current) {
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
      rightScrollRef.current.scrollLeft = leftScrollRef.current.scrollLeft;
    }
  };

  const handleRightScroll = () => {
    if (leftScrollRef.current && rightScrollRef.current) {
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
      leftScrollRef.current.scrollLeft = rightScrollRef.current.scrollLeft;
    }
  };

  // Helper metrics calculations
  const leftStats = useMemo(() => {
    const logs = leftState.parsedLogs;
    const errors = logs.filter(l => l.level === 'ERROR').length;
    const warnings = logs.filter(l => l.level === 'WARN').length;
    const uniqueServices = new Set(logs.map(l => l.service).filter(s => s && s !== '-')).size;
    
    const latencies = logs.filter(l => l.deltaTimeMs !== undefined).map(l => l.deltaTimeMs as number);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
      total: logs.length,
      errors,
      warnings,
      uniqueServices,
      avgLatency
    };
  }, [leftState.parsedLogs]);

  const rightStats = useMemo(() => {
    const logs = rightState.parsedLogs;
    const errors = logs.filter(l => l.level === 'ERROR').length;
    const warnings = logs.filter(l => l.level === 'WARN').length;
    const uniqueServices = new Set(logs.map(l => l.service).filter(s => s && s !== '-')).size;
    
    const latencies = logs.filter(l => l.deltaTimeMs !== undefined).map(l => l.deltaTimeMs as number);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
      total: logs.length,
      errors,
      warnings,
      uniqueServices,
      avgLatency
    };
  }, [rightState.parsedLogs]);

  // Format log entry to line comparison string
  const formatLogsToText = (logs: LogEntry[]) => {
    return logs.map(l => {
      const time = l.timestamp ? `[${l.timestamp}]` : '';
      const level = l.level ? `[${l.level}]` : '';
      const service = l.service && l.service !== '-' ? `[${l.service}]` : '';
      const cleanMsg = (l.message || '').replace(/\r?\n/g, ' ').slice(0, 120);
      return `${time} ${level} ${service} - ${cleanMsg}`;
    }).join('\n');
  };

  const diffResult = useMemo(() => {
    if (!isSplitMode) return { left: [], right: [] };
    const textLeft = formatLogsToText(leftState.parsedLogs);
    const textRight = formatLogsToText(rightState.parsedLogs);
    return computeDiff(textLeft, textRight);
  }, [isSplitMode, leftState.parsedLogs, rightState.parsedLogs]);

  if (!isOpen) return null;

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 240 }} onClick={onClose}>
      <div 
        className="compare-modal" 
        style={{ 
          maxWidth: '1000px', 
          maxHeight: '680px', 
          height: '85vh',
          width: '95vw'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round" style={{ color: '#c678dd' }}>difference</span>
            <h2>Comparador de Sesiones (Log Diffing)</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Cerrar Comparación">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Split mode requirement check */}
        {!isSplitMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px', background: 'var(--bg-panel)', gap: '16px', textAlign: 'center' }}>
            <span className="material-icons-round" style={{ fontSize: '48px', color: '#c678dd', opacity: 0.8 }}>splitscreen</span>
            <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>Modo de Pantalla Dividida Requerido</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                La comparación de sesiones analiza las diferencias métricas y flujos de logs activos lado a lado. Activa el modo de pantalla dividida para cargar dos sesiones de logs diferentes.
              </p>
            </div>
            <button 
              onClick={() => setIsSplitMode(true)}
              className="primary-button"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
            >
              <span className="material-icons-round">splitscreen</span>
              <span>Activar Split Mode</span>
            </button>
          </div>
        ) : (
          <>
            {/* Sub-tabs header */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px', background: 'var(--bg-app)', gap: '12px' }}>
              <button
                onClick={() => setActiveTab('metrics')}
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'metrics' ? '2px solid var(--accent-solid)' : '2px solid transparent',
                  color: activeTab === 'metrics' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Comparación de Métricas
              </button>
              <button
                onClick={() => setActiveTab('diff')}
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'diff' ? '2px solid var(--accent-solid)' : '2px solid transparent',
                  color: activeTab === 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Diferencia de Sesión (Diff)
              </button>
            </div>

            {/* Content areas */}
            <div className="session-diff-content" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
              
              {/* Tab: METRICS */}
              {activeTab === 'metrics' && (
                <div className="metrics-comparison-view" style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
                  <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    
                    {/* Left Pane Summary */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--accent-solid)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>looks_one</span>
                        <span>Sesión Izquierda</span>
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                        <span>Archivo(s) Activo(s):</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {leftState.selectedFiles.map(f => f.includes('::') ? f.split('::')[1] : f).join(', ') || 'Ninguno'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL REGISTROS</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>{leftStats.total}</span>
                        </div>
                        <div style={{ background: 'rgba(224,108,117,0.06)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(224,108,117,0.1)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: '#e06c75', fontWeight: 600 }}>ERRORES / WARN</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: '#e06c75', display: 'block', marginTop: '4px' }}>
                            {leftStats.errors} <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)' }}>/ {leftStats.warnings}</span>
                          </span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>SERVICIOS ÚNICOS</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>{leftStats.uniqueServices}</span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>LATENCIA PROMEDIO</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                            {leftStats.avgLatency >= 1000 ? `${(leftStats.avgLatency / 1000).toFixed(2)}s` : `${leftStats.avgLatency.toFixed(0)}ms`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Pane Summary */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--accent-solid)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>looks_two</span>
                        <span>Sesión Derecha</span>
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                        <span>Archivo(s) Activo(s):</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {rightState.selectedFiles.map(f => f.includes('::') ? f.split('::')[1] : f).join(', ') || 'Ninguno'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL REGISTROS</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>{rightStats.total}</span>
                        </div>
                        <div style={{ background: 'rgba(224,108,117,0.06)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(224,108,117,0.1)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: '#e06c75', fontWeight: 600 }}>ERRORES / WARN</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: '#e06c75', display: 'block', marginTop: '4px' }}>
                            {rightStats.errors} <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)' }}>/ {rightStats.warnings}</span>
                          </span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>SERVICIOS ÚNICOS</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>{rightStats.uniqueServices}</span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>LATENCIA PROMEDIO</span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                            {rightStats.avgLatency >= 1000 ? `${(rightStats.avgLatency / 1000).toFixed(2)}s` : `${rightStats.avgLatency.toFixed(0)}ms`}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Contrast comparison bar */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>Comparativa Rápida de Métricas</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Total logs comparison bar */}
                      <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                        <span>Volumen de Logs (Izquierda vs Derecha)</span>
                        <span>{leftStats.total} vs {rightStats.total}</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${(leftStats.total / (leftStats.total + rightStats.total || 1)) * 100}%`, background: '#61afef' }} />
                        <div style={{ flex: 1, background: '#c678dd' }} />
                      </div>

                      {/* Errors comparison bar */}
                      <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        <span>Errores Críticos (Izquierda vs Derecha)</span>
                        <span>{leftStats.errors} vs {rightStats.errors}</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${(leftStats.errors / (leftStats.errors + rightStats.errors || 1)) * 100}%`, background: '#e06c75' }} />
                        <div style={{ flex: 1, background: '#c678dd' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: VISUAL DIFF */}
              {activeTab === 'diff' && (
                <div className="diff-visualizer-container" style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
                  
                  {/* Left Diff Side */}
                  <div 
                    ref={leftScrollRef}
                    onScroll={handleLeftScroll}
                    className="diff-pane"
                    style={{ 
                      flex: 1, 
                      overflow: 'auto', 
                      background: 'rgba(0,0,0,0.2)', 
                      borderRight: window.innerWidth < 768 ? 'none' : '1px solid var(--border-color)',
                      borderBottom: window.innerWidth < 768 ? '1px solid var(--border-color)' : 'none',
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '11px',
                      whiteSpace: 'pre',
                      padding: '12px'
                    }}
                  >
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 'bold' }}>
                      SESIÓN IZQUIERDA (ORIGINAL)
                    </div>
                    {diffResult.left.map((line, idx) => {
                      const isRemoved = line.type === 'removed';
                      return (
                        <div 
                          key={idx} 
                          style={{
                            background: isRemoved ? 'rgba(224, 108, 117, 0.15)' : 'transparent',
                            color: isRemoved ? '#e06c75' : 'var(--text-secondary)',
                            minHeight: '18px',
                            padding: '0 4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ width: '28px', color: 'var(--text-muted)', marginRight: '6px', userSelect: 'none', display: 'inline-block', textAlign: 'right' }}>{idx + 1}</span>
                          <span>{line.value || ' '}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Diff Side */}
                  <div 
                    ref={rightScrollRef}
                    onScroll={handleRightScroll}
                    style={{ 
                      flex: 1, 
                      overflow: 'auto', 
                      background: 'rgba(0,0,0,0.2)', 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '11px',
                      whiteSpace: 'pre',
                      padding: '12px'
                    }}
                  >
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 'bold' }}>
                      SESIÓN DERECHA (COMPARADA)
                    </div>
                    {diffResult.right.map((line, idx) => {
                      const isAdded = line.type === 'added';
                      return (
                        <div 
                          key={idx} 
                          style={{
                            background: isAdded ? 'rgba(152, 195, 121, 0.15)' : 'transparent',
                            color: isAdded ? '#98c379' : 'var(--text-secondary)',
                            minHeight: '18px',
                            padding: '0 4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ width: '28px', color: 'var(--text-muted)', marginRight: '6px', userSelect: 'none', display: 'inline-block', textAlign: 'right' }}>{idx + 1}</span>
                          <span>{line.value || ' '}</span>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid var(--border-color)', gap: '10px', background: 'var(--bg-panel)' }}>
          <button className="secondary-button" onClick={onClose} style={{ padding: '8px 16px' }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};
