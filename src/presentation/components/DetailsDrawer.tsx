import React, { useCallback, useState, useEffect } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { formatPayload } from '../../domain/formatting/formatPayload';
import { escapeHtml } from '../utils/helpers';
import { getLevelColor } from '../utils/constants';
import { PayloadViewer } from './details/PayloadViewer';
import { getSmartDiagnostic } from '../../domain/utils/diagnosticsHelper';
import { SmartDiagnosticAlert } from './details/SmartDiagnosticAlert';
import { RequestReplay } from './details/RequestReplay';

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
  saveAnnotation: (log: LogEntry, text: string) => void;
  systemSettings: any;
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
  setCurrentPage,
  saveAnnotation,
  systemSettings
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'payload' | 'replay' | 'ai'>('payload');
  const [noteText, setNoteText] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedDiagnosis, setCopiedDiagnosis] = useState(false);
  const [aiCache, setAiCache] = useState<Record<string, string>>({});

  const logKey = activeLog ? `${activeLog.originFile || 'upload'}::${activeLog.originalId || activeLog.id}` : '';
  const currentDiagnosis = aiCache[logKey] || '';

  const handleTriggerAiDiagnose = async () => {
    if (!activeLog) return;
    setAiLoading(true);
    setAiError(null);
    
    // Clear previous diagnosis for this log to show real-time progress
    setAiCache(prev => ({
      ...prev,
      [logKey]: ''
    }));

    try {
      const response = await fetch('/api/ai-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeLog)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}: Error al obtener diagnóstico`);
      }

      if (!response.body) {
        throw new Error('El cuerpo de la respuesta está vacío');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        // Update cache incrementally
        setAiCache(prev => ({
          ...prev,
          [logKey]: accumulatedText
        }));
      }
    } catch (err: any) {
      setAiError(err.message || 'Error inesperado');
    } finally {
      setAiLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    if (!text) return '';
    let html = escapeHtml(text);
    
    // Code blocks: ```lang ... ``` (support unclosed blocks for real-time streaming)
    html = html.replace(/`{3}(.*?)(\n[\s\S]*?)(?:`{3}|$)/g, (_, lang, code) => {
      const cleanCode = code.trim()
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#039;/g, "'");
      return `<pre style="background: rgba(0,0,0,0.22); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 11.5px; overflow-x: auto; margin: 10px 0;"><code style="color: var(--text-primary);">${cleanCode}</code></pre>`;
    });
    
    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.06); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; color: var(--accent-solid);">$1</code>');

    // Headers (h3, h2, h1)
    html = html.replace(/^### (.*)$/gm, '<h3 style="font-size: 13.5px; font-weight: 700; color: var(--accent-solid); margin: 16px 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2 style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 20px 0 10px 0;">$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h1 style="font-size: 17px; font-weight: 800; color: var(--text-primary); margin: 24px 0 12px 0;">$1</h1>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 700; color: var(--text-primary);">$1</strong>');
    
    // Lists
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li style="margin-left: 16px; margin-bottom: 4px; list-style-type: disc; color: var(--text-secondary);">$1</li>');

    // Handle double line breaks as paragraphs
    html = html.replace(/\n\n/g, '<br/><br/>');
    html = html.replace(/\n/g, '<br/>');

    return html;
  };

  // Reset tab and sync noteText when active log changes
  useEffect(() => {
    setActiveSubTab('payload');
    setNoteText(activeLog?.annotation || '');
  }, [activeLog]);

  const handleExportMarkdown = useCallback((log: LogEntry) => {
    const payloadInfo = formatPayload(log.message);
    const codeBlock = payloadInfo.formatted 
      ? `\`\`\`${payloadInfo.kind === 'xml' ? 'xml' : 'json'}\n${payloadInfo.formatted}\n\`\`\`` 
      : `\`\`\`text\n${log.message}\n\`\`\``;
    
    let report = `### 🚨 Reporte de Incidencia - LogScope
- **Registro ID:** #${log.id}
- **Nivel:** ${log.level}
- **Servicio/Método:** \`${log.service}\`
- **ID Correlación:** \`${log.correlationId}\`
- **Clase Origen:** \`${log.className}\`
- **Marca de Tiempo:** ${log.timestamp}
- **Hilo:** \`${log.thread}\`
`;

    if (log.annotation) {
      report += `\n#### 📝 Notas del Analista:\n> ${log.annotation}\n`;
    }

    const smartDiag = getSmartDiagnostic(log);
    if (smartDiag) {
      report += `\n#### 💡 Diagnóstico y Recomendaciones (LogScope Heuristics):\n- **Falla Identificada:** ${smartDiag.title}\n- **Causa Probable:** ${smartDiag.reason}\n- **Recomendación:** ${smartDiag.suggestion}\n`;
    }

    report += `\n#### ⚡ Detalle / Payload:\n${codeBlock}\n\n---\n*Reporte generado automáticamente desde LogScope Analyzer*`;

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
  const smartDiag = getSmartDiagnostic(activeLog);

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

          {/* Editor de Notas del Analista */}
          <div className="drawer-notes-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#e5c07b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                <span className="material-icons-round" style={{ fontSize: '16px' }}>note_alt</span>
                <span>Notas del Analista / Observaciones</span>
              </div>
              {activeLog.annotation && (
                <span style={{ fontSize: '10px', background: 'rgba(229, 192, 123, 0.12)', color: '#e5c07b', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }}>
                  Guardado
                </span>
              )}
            </div>
            <textarea
              className="drawer-notes-textarea"
              placeholder="Escribe observaciones o causas raíz para el reporte de bugs..."
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                saveAnnotation(activeLog, e.target.value);
              }}
            />
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
              <span>{exportSuccess ? '¡Copiado!' : 'Exportar para Reporte (Markdown)'}</span>
            </button>
          </div>

          {/* Heurística de Diagnósticos QA (v15.0) */}
          {smartDiag ? (
            <SmartDiagnosticAlert
              diagnostic={smartDiag}
              copyText={copyText}
              logInfo={{
                id: activeLog.id,
                level: activeLog.level,
                timestamp: activeLog.timestamp,
                service: activeLog.service,
                correlationId: activeLog.correlationId
              }}
            />
          ) : activeDiagnosis ? (
            <div className="diagnosis-box">
              <div className="diagnosis-header">
                <span className="material-icons-round">psychology</span>
                <span>LogScope Diagnóstico del Error</span>
              </div>
              <div className="diagnosis-body" dangerouslySetInnerHTML={{ __html: activeDiagnosis }} />
            </div>
          ) : null}

          {/* Sub-tabs de la sección inferior */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '14px', gap: '8px' }}>
            <button 
              className={`tab-btn`}
              onClick={() => setActiveSubTab('payload')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeSubTab === 'payload' ? '2px solid var(--accent-solid)' : '2px solid transparent',
                color: activeSubTab === 'payload' ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s'
              }}
            >
              Payload e Inspector
            </button>
            <button 
              className={`tab-btn`}
              onClick={() => setActiveSubTab('replay')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeSubTab === 'replay' ? '2px solid var(--accent-solid)' : '2px solid transparent',
                color: activeSubTab === 'replay' ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s'
              }}
            >
              HTTP Replay Console
            </button>
            <button 
              className={`tab-btn`}
              onClick={() => setActiveSubTab('ai')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeSubTab === 'ai' ? '2px solid var(--accent-solid)' : '2px solid transparent',
                color: activeSubTab === 'ai' ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '14px' }}>psychology</span>
              Diagnóstico IA
            </button>
          </div>

          {activeSubTab === 'payload' && (
            <PayloadViewer 
              activeLog={activeLog}
              searchTerm={searchTerm}
              isRegexSearch={isRegexSearch}
              copyText={copyText}
              isDrawerOpen={isDrawerOpen}
            />
          )}

          {activeSubTab === 'replay' && (
            <RequestReplay activeLog={activeLog} />
          )}

          {activeSubTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '16px' }}>
              {!systemSettings.aiEnabled ? (
                <div style={{ padding: '16px', background: 'rgba(229,192,123,0.06)', border: '1px solid rgba(229,192,123,0.15)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: '1.5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e5c07b', fontWeight: 600, marginBottom: '6px' }}>
                    <span className="material-icons-round">smart_toy</span>
                    <span>Asistente de IA Desactivado</span>
                  </div>
                  <span>
                    El diagnóstico inteligente asistido por IA está apagado. Habilítalo y configura tu API Key de Gemini, Ollama o proveedor compatible con OpenAI desde los <b>Ajustes del Sistema</b> (icono de engranaje en la barra lateral).
                  </span>
                </div>
              ) : (
                <>
                  {aiError ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ padding: '12px 16px', background: 'rgba(224,108,117,0.1)', border: '1px solid rgba(224,108,117,0.2)', borderRadius: '6px', color: '#e06c75', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round">warning</span>
                        <span>{aiError}</span>
                      </div>
                      <button 
                        onClick={handleTriggerAiDiagnose}
                        className="primary-button" 
                        style={{ alignSelf: 'flex-start', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>refresh</span>
                        <span>Reintentar Diagnóstico</span>
                      </button>
                    </div>
                  ) : currentDiagnosis ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div 
                        style={{ 
                          background: 'rgba(0,0,0,0.12)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '8px', 
                          padding: '16px', 
                          fontSize: '13px', 
                          lineHeight: '1.6',
                          color: 'var(--text-secondary)',
                          position: 'relative'
                        }}
                      >
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(currentDiagnosis) }} />
                        {aiLoading && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', opacity: 0.6, fontSize: '11px', fontStyle: 'italic' }}>
                            <div className="dot-flashing"></div>
                            <span>IA está escribiendo...</span>
                          </div>
                        )}
                      </div>
                      {!aiLoading && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => {
                              copyText(currentDiagnosis);
                              setCopiedDiagnosis(true);
                              setTimeout(() => setCopiedDiagnosis(false), 2000);
                            }}
                            className="secondary-button" 
                            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>{copiedDiagnosis ? 'done' : 'content_copy'}</span>
                            <span>{copiedDiagnosis ? '¡Copiado!' : 'Copiar Diagnóstico'}</span>
                          </button>
                          <button 
                            onClick={handleTriggerAiDiagnose}
                            className="secondary-button" 
                            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>refresh</span>
                            <span>Regenerar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : aiLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px', opacity: 0.8, animation: 'tail-pulse-opacity 1.5s infinite ease-in-out' }}>
                      <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--accent-solid)' }}>psychology</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Iniciando análisis técnico de IA...</span>
                    </div>
                  ) : (
                    <div 
                      style={{ 
                        padding: '30px', 
                        border: '2px dashed var(--border-color)', 
                        borderRadius: '8px', 
                        textAlign: 'center', 
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--accent-solid)', opacity: 0.6 }}>smart_toy</span>
                      <div style={{ fontSize: '13px' }}>Genera un informe detallado con IA para diagnosticar la causa raíz de esta incidencia.</div>
                      <button 
                        onClick={handleTriggerAiDiagnose}
                        className="primary-button" 
                        style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>bolt</span>
                        <span>Generar Diagnóstico IA</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
