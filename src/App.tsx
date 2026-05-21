import { useEffect, useMemo, useState, useCallback } from 'react';
import { parseLogs, defaultLevels } from './domain/parsing/parseLogs';
import { applyFilters, FilterState, SortColumn, SortDirection } from './application/usecases/applyFilters';
import { buildStats, buildDistribution } from './application/usecases/buildStats';
import { fetchFileContent, fetchFiles, LogFileMeta } from './infrastructure/api/filesApi';
import { LogEntry, LogLevel } from './domain/models/LogEntry';
import { formatPayload } from './domain/formatting/formatPayload';
import { highlightJson } from './domain/formatting/highlightJson';
import { highlightXml } from './domain/formatting/highlightXml';

const PAGE_SIZE = 200;
const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
const LEVEL_META: Record<string, { color: string }> = {
  TRACE: { color: '0, 0%, 65%' },
  DEBUG: { color: '210, 40%, 58%' },
  INFO:  { color: '120, 25%, 50%' },
  WARN:  { color: '35, 50%, 58%' },
  ERROR: { color: '0, 55%, 55%' },
  REQ:   { color: '170, 30%, 48%' },
  RESP:  { color: '50, 35%, 55%' }
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toLocalISOString(date: Date): string {
  const tzoffset = date.getTimezoneOffset() * 60000;
  return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
}

function highlightText(text: string, search: string, isRegex: boolean): React.ReactNode {
  if (!search) return text;
  try {
    let regex: RegExp;
    if (isRegex) {
      regex = new RegExp(`(${search})`, 'gi');
    } else {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(`(${escaped})`, 'gi');
    }
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? <mark key={i} className="search-match">{part}</mark> : part
        )}
      </>
    );
  } catch {
    return text;
  }
}

function runDiagnosis(msg: string): string | null {
  const txt = msg.toLowerCase();
  if (txt.includes("attempt to insert duplicate key row in object") && txt.includes("unique index")) {
    const tableMatch = msg.match(/object\s+'([^']+)'/i);
    const indexMatch = msg.match(/unique index\s+'([^']+)'/i);
    const tbl = tableMatch ? tableMatch[1] : 'desconocida';
    const idx = indexMatch ? indexMatch[1] : 'desconocido';
    return `<b>Error de Clave Duplicada (SQL Server / Sybase).</b><br>
            Se intentó insertar un registro duplicado en <code>${tbl}</code> bajo el índice <code>${idx}</code>.<br>
            <i>Acción correctiva:</i> Verificar que la petición no se haya enviado dos veces.`;
  }
  if (txt.includes("cuenta no esta vigente") || txt.includes("cuenta no está vigente")) {
    return `<b>Cuenta Inactiva / No Vigente.</b><br>
            La cuenta está bloqueada o inactiva en el core bancario.<br>
            <i>Acción correctiva:</i> Revisar estado de la cuenta.`;
  }
  if (txt.includes("timeout") || txt.includes("sockettimeoutexception")) {
    return `<b>Timeout de Conexión.</b><br>
            La conexión con el WS/API externa tardó más de lo permitido.<br>
            <i>Acción correctiva:</i> Comprobar conectividad con el servicio.`;
  }
  if (txt.includes("nullpointerexception")) {
    return `<b>NullPointerException.</b><br>
            Se intentó acceder a un objeto nulo en el servidor Java.<br>
            <i>Acción correctiva:</i> Reportar al equipo de desarrollo con la traza completa.`;
  }
  return null;
}

export function App() {
  const [files, setFiles] = useState<LogFileMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [activeFile, setActiveFile] = useState<LogFileMeta | null>(null);
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    activeLevels: defaultLevels(), activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null
  });
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeLog, setActiveLog] = useState<LogEntry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark-theme');

  useEffect(() => { document.body.className = theme; localStorage.setItem('theme', theme); }, [theme]);

  useEffect(() => {
    setLoadingFiles(true);
    fetchFiles().then(f => { setFiles(f); setLoadingFiles(false); });
  }, []);

  const uniqueServices = useMemo(() =>
    Array.from(new Set(parsedLogs.map(l => l.service).filter(s => s && s !== '-'))).sort(), [parsedLogs]
  );

  const filteredLogs = useMemo(() => applyFilters(parsedLogs, filters, sortColumn, sortDirection), [parsedLogs, filters, sortColumn, sortDirection]);
  const stats = useMemo(() => buildStats(parsedLogs), [parsedLogs]);
  const distribution = useMemo(() => buildDistribution(filteredLogs), [filteredLogs]);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageLogs = filteredLogs.slice(pageStart, pageStart + PAGE_SIZE);
  const activeDiagnosis = activeLog ? runDiagnosis(activeLog.message) : null;

  const handleFileClick = async (file: LogFileMeta) => {
    setActiveFile(file);
    const content = await fetchFileContent(file.name);
    const parsed = parseLogs(content);
    setParsedLogs(parsed);
    setFilters(p => ({ ...p, activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, activeLevels: defaultLevels() }));
    setSortColumn(null); setSortDirection('asc'); setCurrentPage(1); setActiveLog(null); setIsDrawerOpen(false);
  };

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      setActiveFile({ name: file.name, sizeBytes: file.size, modifiedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
      const parsed = parseLogs(content);
      setParsedLogs(parsed);
      setFilters(p => ({ ...p, activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, activeLevels: defaultLevels() }));
      setSortColumn(null); setSortDirection('asc'); setCurrentPage(1); setActiveLog(null); setIsDrawerOpen(false);
    };
    reader.readAsText(file);
  }, []);

  const copyText = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { console.warn('Copy failed'); }
  }, []);

  const handleLevelClick = useCallback((level: LogLevel) => {
    const isAllActive = filters.activeLevels.size === LOG_LEVELS.length;
    let newLevels: Set<LogLevel>;
    if (isAllActive) {
      newLevels = new Set([level]);
    } else {
      newLevels = new Set(filters.activeLevels);
      if (newLevels.has(level)) {
        newLevels.delete(level);
        if (newLevels.size === 0) {
          newLevels = defaultLevels();
        }
      } else {
        newLevels.add(level);
      }
    }
    setFilters(p => ({ ...p, activeLevels: newLevels }));
    setCurrentPage(1);
  }, [filters.activeLevels]);

  const KPI_CARDS = [
    { icon: 'receipt_long', label: 'Logs Parseados', value: stats.total, sub: activeFile ? activeFile.name : 'Ningún archivo cargado', cls: 'blue' },
    { icon: 'error_outline', label: 'Errores Detectados', value: stats.errorCount, sub: stats.total ? `${((stats.errorCount / stats.total) * 100).toFixed(1)}% del total` : '0%', cls: 'red' },
    { icon: 'warning_amber', label: 'Advertencias (Warn)', value: stats.warnCount, sub: 'Alertas en ejecución', cls: 'yellow' },
    { icon: 'dns', label: 'Servicios Únicos', value: stats.uniqueServices, sub: `${stats.uniqueServices} endpoints`, cls: 'purple' }
  ];

  return (
    <div className={`app-container ${theme}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <span className="material-icons-round logo-icon">terminal</span>
            <div><h1>LogScope</h1><span className="sub-logo">Capa Media Analyzer</span></div>
          </div>
        </div>
        <div className="sidebar-section">
          <div className="section-title">
            <span>ARCHIVOS LOCALES</span>
            <button className="icon-button" title="Refrescar" onClick={() => { setLoadingFiles(true); fetchFiles().then(f => { setFiles(f); setLoadingFiles(false); }); }}>
              <span className="material-icons-round">refresh</span>
            </button>
          </div>
          <div className="files-list">
            {loadingFiles ? <div className="zero-state"><div className="loader-spinner"></div><p>Cargando archivos...</p></div>
            : files.length === 0 ? <div className="zero-state"><p>No se encontraron logs (.log/.txt) en la carpeta.</p></div>
            : files.map(file => (
              <button key={file.name} className={`file-item ${activeFile?.name === file.name ? 'active' : ''}`} onClick={() => handleFileClick(file)}>
                <span className="material-icons-round file-icon">insert_drive_file</span>
                <div className="file-details">
                  <span className="file-name" title={file.name}>{file.name}</span>
                  <div className="file-meta"><span>{(file.sizeBytes / 1024).toFixed(1)} KB</span><span> • </span><span>{new Date(file.modifiedAt).toLocaleDateString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-section drag-drop-section">
          <div className="section-title"><span>ANALIZAR OTROS ARCHIVOS</span></div>
          <div className="drop-zone" onClick={() => document.getElementById('file-input')?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('hover'); }}
            onDragLeave={e => e.currentTarget.classList.remove('hover')}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('hover'); if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]); }}>
            <span className="material-icons-round drop-icon">cloud_upload</span>
            <p>Suelte archivos .log o .txt aquí</p>
            <span className="drop-subtext">o haz clic para explorar</span>
            <input type="file" id="file-input" accept=".log,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleFileUpload(e.target.files[0]); }} />
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="theme-toggle-container">
            <button className="theme-toggle-btn" onClick={() => setTheme(t => t === 'dark-theme' ? 'light-theme' : 'dark-theme')}>
              <span className="material-icons-round sun-icon">light_mode</span>
              <span className="material-icons-round moon-icon">dark_mode</span>
              <span className="theme-text">{theme === 'dark-theme' ? 'Tema Oscuro' : 'Tema Claro'}</span>
            </button>
          </div>
          <div className="system-stats"><span className="system-status active"></span><span>Conectado a Logs</span></div>
        </div>
      </aside>

      <main className="main-content">
        <section className="dashboard-grid">
          {KPI_CARDS.map((card, i) => (
            <div key={i} className={`kpi-card gradient-${card.cls}`}>
              <div className="card-icon"><span className="material-icons-round">{card.icon}</span></div>
              <div className="card-info">
                <span className="card-label">{card.label}</span>
                <h2>{card.value}</h2>
                <span className="card-subtext">{card.sub}</span>
              </div>
            </div>
          ))}
        </section>

        {parsedLogs.length > 0 && (
          <section className="distribution-section">
            <div className="distribution-header">
              <span>DISTRIBUCIÓN POR NIVELES</span>
              <div className="distribution-legend">
                {distribution.map(d => (
                  <div key={d.level} className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: `hsl(${LEVEL_META[d.level]?.color || '0,0%,50%'})` }}></div>
                    <span>{d.level}: <b>{d.count}</b></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="distribution-bar">
              {distribution.length === 0 ? <div className="empty-bar-msg">Sin datos para la selección actual</div>
              : distribution.map(d => {
                const pct = ((d.count / filteredLogs.length) * 100).toFixed(1);
                return <div key={d.level} className="dist-segment" style={{ width: `${pct}%`, backgroundColor: `hsl(${LEVEL_META[d.level]?.color || '0,0%,50%'})` }} data-tooltip={`${d.level}: ${d.count} (${pct}%)`} onClick={() => { const s = new Set<LogLevel>(); s.add(d.level); setFilters(p => ({ ...p, activeLevels: s })); setCurrentPage(1); }} />;
              })}
            </div>
          </section>
        )}

        {parsedLogs.length > 0 && (
          <section className="filter-panel">
            <div className="filter-row search-row">
              <div className="search-input-wrapper">
                <span className="material-icons-round search-icon">search</span>
                <input type="text" id="search-input" placeholder="Buscar por método, mensaje, IP, ID de correlación o payload..." value={filters.searchTerm}
                  onChange={e => { setFilters(p => ({ ...p, searchTerm: e.target.value })); setCurrentPage(1); }} />
                {filters.searchTerm && <button className="clear-search-btn" onClick={() => { setFilters(p => ({ ...p, searchTerm: '' })); setCurrentPage(1); }}><span className="material-icons-round">close</span></button>}
              </div>
              <div className="search-options">
                <button className={`option-pill ${filters.isRegexSearch ? 'active' : ''}`} onClick={() => { setFilters(p => ({ ...p, isRegexSearch: !p.isRegexSearch })); setCurrentPage(1); }}>RegEx</button>
                <button className={`option-pill ${filters.isPayloadsOnly ? 'active' : ''}`} onClick={() => { setFilters(p => ({ ...p, isPayloadsOnly: !p.isPayloadsOnly })); setCurrentPage(1); }}>Con Payloads</button>
              </div>
            </div>
            <div className="filter-row control-row">
              <div className="level-pills">
                <span className="filter-group-label">NIVEL:</span>
                <button className={`option-pill level-all-pill ${filters.activeLevels.size === LOG_LEVELS.length ? 'active' : ''}`}
                  onClick={() => { setFilters(p => ({ ...p, activeLevels: defaultLevels() })); setCurrentPage(1); }}><span>TODOS</span></button>
                {LOG_LEVELS.map(level => {
                  const active = filters.activeLevels.has(level);
                  const meta = LEVEL_META[level];
                  return <button key={level} className={`level-pill level-${level.toLowerCase()}-pill ${active ? 'active' : ''}`}
                    onClick={() => handleLevelClick(level)}>{level}</button>;
                })}
              </div>
              <div className="dropdown-filters">
                <div className="select-wrapper">
                  <span className="material-icons-round select-icon">filter_alt</span>
                  <select value={filters.activeService} onChange={e => { setFilters(p => ({ ...p, activeService: e.target.value })); setCurrentPage(1); }}>
                    <option value="ALL">Todos los Servicios</option>
                    {uniqueServices.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="date-filter-group">
                  <span className="material-icons-round date-filter-icon">date_range</span>
                  <label className="filter-group-label" htmlFor="date-from">Desde:</label>
                  <input type="datetime-local" id="date-from" className="date-input" value={filters.dateFrom ? toLocalISOString(filters.dateFrom) : ''}
                    onChange={e => { setFilters(p => ({ ...p, dateFrom: e.target.value ? new Date(e.target.value) : null })); setCurrentPage(1); }} />
                  <label className="filter-group-label" htmlFor="date-to">Hasta:</label>
                  <input type="datetime-local" id="date-to" className="date-input" value={filters.dateTo ? toLocalISOString(filters.dateTo) : ''}
                    onChange={e => { setFilters(p => ({ ...p, dateTo: e.target.value ? new Date(e.target.value) : null })); setCurrentPage(1); }} />
                  {(filters.dateFrom || filters.dateTo) && <button id="btn-clear-dates" className="secondary-button" onClick={() => { setFilters(p => ({ ...p, dateFrom: null, dateTo: null })); setCurrentPage(1); }}><span className="material-icons-round">close</span></button>}
                </div>
                <button id="btn-reset-filters" className="secondary-button" onClick={() => { setFilters({ activeLevels: defaultLevels(), activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null }); setSortColumn(null); setSortDirection('asc'); setCurrentPage(1); }}>
                  <span className="material-icons-round">restart_alt</span> Reestablecer
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="logs-feed-section">
          <div className="feed-header">
            <div className="feed-info">
              <span className="material-icons-round">wysiwyg</span>
              <span>{filteredLogs.length > 0 ? `Visualizando ${filteredLogs.length === parsedLogs.length ? `${filteredLogs.length} registros` : `${filteredLogs.length} de ${parsedLogs.length} registros (filtrado)`}` : 'Visualizando 0 registros'}</span>
            </div>
            <div className="feed-actions">
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked onChange={e => document.getElementById('feed-viewport')?.classList.toggle('wrap-lines', e.target.checked)} />
                <span className="slider"></span>
                <span className="toggle-label">Ajustar líneas</span>
              </label>
            </div>
          </div>
          <div className="feed-viewport" id="feed-viewport">
            {filteredLogs.length === 0 ? (
              <div className="zero-state">
                <span className="material-icons-round zero-icon">{parsedLogs.length === 0 ? 'insert_drive_file' : 'search_off'}</span>
                <h3>{parsedLogs.length === 0 ? 'Ningún Archivo Seleccionado' : 'No se encontraron registros'}</h3>
                <p>{parsedLogs.length === 0 ? 'Por favor, selecciona un archivo de log de la barra lateral o arrastra uno nuevo aquí para analizarlo.' : 'Ningún log coincide con tus filtros o término de búsqueda.'}</p>
              </div>
            ) : (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th width="3%"></th>
                    {(['timestamp', 'level', 'service', 'correlationId', 'message'] as const).map(col => (
                      <th key={col} width={col === 'timestamp' ? '14%' : col === 'level' ? '8%' : col === 'service' ? '18%' : col === 'correlationId' ? '15%' : '42%'}
                        className={`sortable-th ${sortColumn === col ? 'sort-active' : ''}`} data-sort-key={col}
                        onClick={() => {
                          if (sortColumn === col) {
                            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortColumn(col);
                            setSortDirection('asc');
                          }
                          setCurrentPage(1);
                        }}>
                        {{ timestamp: 'Marca de Tiempo', level: 'Nivel', service: 'Servicio / Método', correlationId: 'ID Correlación', message: 'Mensaje / Contenido' }[col]}
                        <span className="sort-indicator">{sortColumn === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageLogs.map(log => {
                    const lc = LEVEL_META[log.level]?.color || '200, 10%, 50%';
                    const dateFormatted = log.timestamp.split(',')[0];
                    const snippet = log.message.trim().replace(/\s+/g, ' ').slice(0, 120) + (log.message.length > 120 ? '...' : '');
                    return (
                      <tr key={log.id} id={`log-row-${log.id}`} className={activeLog?.id === log.id ? 'active-row' : ''} onClick={() => { setActiveLog(log); setIsDrawerOpen(true); }}>
                        <td><span className="material-icons-round chevron-icon">chevron_right</span></td>
                        <td><span className="log-timestamp">{dateFormatted}</span></td>
                        <td><span className="badge badge-outline" style={{ color: `hsl(${lc})`, borderColor: `hsla(${lc},0.4)`, background: `hsla(${lc},0.08)` }}>{log.level}</span></td>
                        <td><div className="badge badge-service" title={log.service}>{log.service}</div></td>
                        <td>{log.correlationId !== '-' ? <span className="badge badge-correlation" title={log.correlationId}>{log.correlationId}</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                        <td><div className="log-message-cell">{highlightText(snippet, filters.searchTerm, filters.isRegexSearch)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="feed-footer">
            <div className="pagination-info">{filteredLogs.length === 0 ? 'Mostrando registros 0-0' : `Mostrando registros ${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, filteredLogs.length)} de ${filteredLogs.length}`}</div>
            <div className="pagination-buttons">
              <button id="btn-prev-page" className="secondary-button" disabled={currentPage <= 1} onClick={() => { setCurrentPage(p => p - 1); document.getElementById('feed-viewport')?.scrollTo(0, 0); }}>
                <span className="material-icons-round">chevron_left</span> Anterior
              </button>
              <span className="page-indicator">Página {currentPage} de {totalPages}</span>
              <button id="btn-next-page" className="secondary-button" disabled={currentPage >= totalPages} onClick={() => { setCurrentPage(p => p + 1); document.getElementById('feed-viewport')?.scrollTo(0, 0); }}>
                Siguiente <span className="material-icons-round">chevron_right</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {isDrawerOpen && activeLog && (
        <>
          <div className="details-overlay active" onClick={() => setIsDrawerOpen(false)}></div>
          <aside className="details-drawer active">
            <div className="drawer-header">
              <div className="drawer-title-area">
                <span className="material-icons-round drawer-icon">segment</span>
                <h2>Detalle del Registro</h2>
              </div>
              <button id="btn-close-drawer" className="icon-button" onClick={() => setIsDrawerOpen(false)}><span className="material-icons-round">close</span></button>
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
                    <span className="badge" style={{ background: `hsla(${LEVEL_META[activeLog.level]?.color || '0,0%,50%'},0.12)`, color: `hsl(${LEVEL_META[activeLog.level]?.color || '0,0%,50%'})` }}>{activeLog.level}</span>
                  </span>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Marca de Tiempo</span>
                  <span className="meta-value">{activeLog.timestamp}</span>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Servicio o Método</span>
                  <span className="meta-value meta-value-accent">{activeLog.service}</span>
                </div>
                <div className="meta-field">
                  <span className="meta-label">ID de Correlación</span>
                  <span className="meta-value meta-value-mono">{activeLog.correlationId}</span>
                </div>
                <div className="meta-field">
                  <span className="meta-label">Clase / Origen</span>
                  <span className="meta-value" title={activeLog.className}>{activeLog.className}</span>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Hilo de Ejecución</span>
                  <span className="meta-value meta-value-mono">{activeLog.thread}</span>
                </div>
              </div>

              {activeDiagnosis && (
                <div className="diagnosis-box">
                  <div className="diagnosis-header"><span className="material-icons-round">psychology</span><span>LogScope Diagnóstico del Error</span></div>
                  <div className="diagnosis-body" dangerouslySetInnerHTML={{ __html: activeDiagnosis }} />
                </div>
              )}

              {(() => {
                const payload = formatPayload(activeLog.message);
                if (payload.kind === 'none') return null;
                const payloadContent = payload.kind === 'xml' ? highlightXml(payload.formatted || '') : highlightJson(payload.formatted || '');
                return (
                  <div>
                    <div className="drawer-section-title">
                      <span>{payload.title}</span>
                      <button className="secondary-button copy-btn" onClick={() => copyText(payload.formatted || '')}>
                        <span className="material-icons-round" style={{ fontSize: 12 }}>content_copy</span> Copiar
                      </button>
                    </div>
                    {payload.prefix && <div className="payload-prefix">{escapeHtml(payload.prefix)}</div>}
                    <pre className="text-area-box formatted-box" dangerouslySetInnerHTML={{ __html: payloadContent }} />
                    {payload.suffix && <div className="payload-suffix">{escapeHtml(payload.suffix)}</div>}
                  </div>
                );
              })()}

              <details className="raw-details">
                <summary className="drawer-section-title" style={{ cursor: 'pointer' }}>
                  <span>Mensaje del Registro (Crudo)</span>
                  <button className="secondary-button copy-btn" onClick={e => { e.preventDefault(); e.stopPropagation(); copyText(activeLog.message); }}>
                    <span className="material-icons-round" style={{ fontSize: 12 }}>content_copy</span> Copiar
                  </button>
                </summary>
                <div className="text-area-box raw-box">{escapeHtml(activeLog.message)}</div>
              </details>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
