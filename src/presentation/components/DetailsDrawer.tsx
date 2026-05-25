import React, { useCallback } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { formatPayload } from '../../domain/formatting/formatPayload';
import { escapeHtml } from '../utils/helpers';
import { getLevelColor } from '../utils/constants';
import { PayloadViewer } from './details/PayloadViewer';

interface DetailsDrawerProps {
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeLog: LogEntry | null;
  pinnedKeys: Set<string>;
  togglePin: (log: LogEntry) => void;
  compareQueue: LogEntry[];
  setCompareQueue: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  exportSuccess: boolean;
  setExportSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  activeDiagnosis: string | null;
  copyText: (text: string) => Promise<void>;
  searchTerm: string;
  isRegexSearch: boolean;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
  isDrawerOpen,
  setIsDrawerOpen,
  activeLog,
  pinnedKeys,
  togglePin,
  compareQueue,
  setCompareQueue,
  exportSuccess,
  setExportSuccess,
  activeDiagnosis,
  copyText,
  searchTerm,
  isRegexSearch,
  setFilters,
  setCurrentPage
}) => {

  const handleExportMarkdown = useCallback((log: LogEntry) => {
    const payloadInfo = formatPayload(log.message);
    const codeBlock = payloadInfo.formatted 
      ? `\`\`\`${payloadInfo.kind === 'xml' ? 'xml' : 'json'}\n${payloadInfo.formatted}\n\`\`\`` 
      : `\`\`\`text\n${log.message}\n\`\`\``;
    
    const report = `### 🚨 Reporte de Incidencia - LogScope
- **Registro ID:** #${log.id}
- **Nivel:** ${log.level}
- **Servicio/Método:** \`${log.service}\`
- **ID Correlación:** \`${log.correlationId}\`
- **Clase Origen:** \`${log.className}\`
- **Marca de Tiempo:** ${log.timestamp}
- **Hilo:** \`${log.thread}\`

#### 📝 Detalle / Payload:
${codeBlock}

---
*Reporte generado automáticamente desde LogScope Analyzer*`;

    copyText(report);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  }, [copyText, setExportSuccess]);

  const handleIsolateFlow = useCallback((cid: string) => {
    setFilters((p: any) => ({ ...p, correlationId: cid }));
    setCurrentPage(1);
  }, [setFilters, setCurrentPage]);

  if (!isDrawerOpen || !activeLog) return null;

  const isPinned = pinnedKeys.has(`${activeLog.originFile || 'upload'}::${activeLog.originalId || activeLog.id}`);
  const isInCompareQueue = compareQueue.some(c => c.id === activeLog.id);

  return (
    <>
      <div className="details-overlay active" onClick={() => setIsDrawerOpen(false)}></div>
      <aside className="details-drawer active">
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="material-icons-round drawer-icon">segment</span>
            <h2>Detalle del Registro</h2>
          </div>
          <div className="drawer-header-actions">
            <button 
              className={`icon-button pin-drawer-btn ${isPinned ? 'active' : ''}`} 
              title={isPinned ? "Quitar marcador" : "Fijar log (Marcador)"}
              onClick={() => togglePin(activeLog)}
            >
              <span className="material-icons-round">push_pin</span>
            </button>
            <button 
              id="btn-close-drawer" 
              className="icon-button" 
              onClick={() => setIsDrawerOpen(false)}
            >
              <span className="material-icons-round">close</span>
            </button>
          </div>
        </div>
        
        <div className="drawer-body">
          <div className="drawer-meta-grid">
            <div className="meta-field">
              <span className="meta-label">ID Registro</span>
              <span className="meta-value">#{activeLog.id}</span>
            </div>
            <div className="meta-field">
              <span className="meta-label">Nivel</span>
              <span className="meta-value">
                <span 
                  className="badge" 
                  style={{ 
                    background: `hsla(${getLevelColor(activeLog.level)},0.12)`, 
                    color: `hsl(${getLevelColor(activeLog.level)})` 
                  }}
                >
                  {activeLog.level}
                </span>
              </span>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Marca de Tiempo</span>
              <span className="meta-value">{activeLog.timestamp}</span>
            </div>
            {activeLog.deltaTimeMs !== undefined && (
              <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                <span className="meta-label">Latencia (Delta)</span>
                <span 
                  className={`meta-value latency-value ${
                    activeLog.deltaTimeMs > 5000 
                      ? 'latency-danger' 
                      : activeLog.deltaTimeMs > 1000 
                        ? 'latency-warning' 
                        : 'latency-normal'
                  }`}
                >
                  +{activeLog.deltaTimeMs >= 1000 ? `${(activeLog.deltaTimeMs / 1000).toFixed(2)}s` : `${activeLog.deltaTimeMs}ms`} (desde log previo del mismo flujo)
                </span>
              </div>
            )}
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Servicio o Método</span>
              <span className="meta-value meta-value-accent">{activeLog.service}</span>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">ID de Correlación</span>
              <div className="correlation-drawer-value">
                <span className="meta-value meta-value-mono">{activeLog.correlationId}</span>
                {activeLog.correlationId !== '-' && (
                  <button 
                    className="secondary-button compact-btn"
                    title="Aislar este flujo de peticiones"
                    onClick={() => handleIsolateFlow(activeLog.correlationId)}
                  >
                    <span className="material-icons-round" style={{ fontSize: 13 }}>filter_alt</span> Aislar Flujo
                  </button>
                )}
              </div>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Clase / Origen</span>
              <span className="meta-value" title={activeLog.className}>{activeLog.className}</span>
            </div>
            <div className="meta-field" style={{ gridColumn: 'span 2' }}>
              <span className="meta-label">Hilo de Ejecución</span>
              <span className="meta-value meta-value-mono">{activeLog.thread}</span>
            </div>
          </div>

          <div className="drawer-actions-row">
            <button 
              className={`secondary-button compare-action-btn ${isInCompareQueue ? 'active' : ''}`}
              disabled={!isInCompareQueue && compareQueue.length >= 2}
              onClick={() => {
                setCompareQueue(prev => {
                  const exists = prev.some(c => c.id === activeLog.id);
                  if (exists) {
                    return prev.filter(c => c.id !== activeLog.id);
                  } else {
                    if (prev.length >= 2) return prev;
                    return [...prev, activeLog];
                  }
                });
              }}
            >
              <span className="material-icons-round">
                {isInCompareQueue ? 'remove_done' : 'compare_arrows'}
              </span>
              <span>{isInCompareQueue ? 'Quitar de Comparar' : 'Agregar a Comparar'}</span>
            </button>
            <button className="primary-button export-md-btn" onClick={() => handleExportMarkdown(activeLog)}>
              <span className="material-icons-round">{exportSuccess ? 'done' : 'bug_report'}</span>
              <span>{exportSuccess ? '¡Copiado a Reporte!' : 'Exportar para Reporte (Markdown)'}</span>
            </button>
          </div>

          {activeDiagnosis && (
            <div className="diagnosis-box">
              <div className="diagnosis-header">
                <span className="material-icons-round">psychology</span>
                <span>LogScope Diagnóstico del Error</span>
              </div>
              <div className="diagnosis-body" dangerouslySetInnerHTML={{ __html: activeDiagnosis }} />
            </div>
          )}

          <PayloadViewer 
            activeLog={activeLog}
            searchTerm={searchTerm}
            isRegexSearch={isRegexSearch}
            copyText={copyText}
            isDrawerOpen={isDrawerOpen}
          />

          <details className="raw-details">
            <summary className="drawer-section-title" style={{ cursor: 'pointer' }}>
              <span>Mensaje del Registro (Crudo)</span>
              <button 
                className="secondary-button copy-btn" 
                onClick={e => { e.preventDefault(); e.stopPropagation(); copyText(activeLog.message); }}
              >
                <span className="material-icons-round" style={{ fontSize: 12 }}>content_copy</span> Copiar
              </button>
            </summary>
            <div className="text-area-box raw-box">{escapeHtml(activeLog.message)}</div>
          </details>
        </div>
      </aside>
    </>
  );
};
