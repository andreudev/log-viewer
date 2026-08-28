import React, { useMemo, useRef, useEffect, useState } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { LogEntry } from '../../domain/models/LogEntry';
import { SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { getFileColorStyle, highlightText } from '../utils/helpers';
import { getLevelColor } from '../utils/constants';
import { AnnotationPopover } from './AnnotationPopover';
import { RawLiveView } from './RawLiveView';

interface LogsTableProps {
  filteredLogs: LogEntry[];
  pageLogs: LogEntry[];
  parsedLogs: LogEntry[];
  currentPage: number;
  totalPages: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  pageStart: number;
  activeLog: LogEntry | null;
  setActiveLog: React.Dispatch<React.SetStateAction<LogEntry | null>>;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  focusedIndex: number | null;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  pinnedKeys: Set<string>;
  togglePin: (log: LogEntry) => void;
  selectedFiles: string[];
  sortColumn: SortColumn;
  setSortColumn: React.Dispatch<React.SetStateAction<SortColumn>>;
  sortDirection: SortDirection;
  setSortDirection: React.Dispatch<React.SetStateAction<SortDirection>>;
  searchTerm: string;
  isRegexSearch: boolean;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  wrapLines: boolean;
  setWrapLines: (wrap: boolean) => void;
  viewMode: 'virtual' | 'paginated';
  setViewMode: (mode: 'virtual' | 'paginated') => void;
  saveAnnotation: (log: LogEntry, text: string) => void;
  isTailing: boolean;
  autoScrollTail: boolean;
  downloadFilteredLogs: () => void;
  isSplitMode?: boolean;
  setIsSplitMode?: (mode: boolean) => void;
  /**
   * Whether the feed is showing the parsed table or the raw monospace
   * text. Controlled by App.tsx (one toggle per session) so that:
   *  - both panes in split mode stay in sync
   *  - the mode survives file changes, split toggles, and remounts
   */
  displayMode: 'parsed' | 'raw';
  setDisplayMode: (mode: 'parsed' | 'raw') => void;
}

export const LogsTable: React.FC<LogsTableProps> = ({
  filteredLogs,
  pageLogs,
  parsedLogs,
  currentPage,
  totalPages,
  setCurrentPage,
  pageStart,
  activeLog,
  setActiveLog,
  setIsDrawerOpen,
  focusedIndex,
  setFocusedIndex,
  pinnedKeys,
  togglePin,
  selectedFiles,
  sortColumn,
  setSortColumn,
  sortDirection,
  setSortDirection,
  searchTerm,
  isRegexSearch,
  setFilters,
  wrapLines,
  setWrapLines,
  viewMode,
  setViewMode,
  saveAnnotation,
  isTailing,
  autoScrollTail,
  downloadFilteredLogs,
  isSplitMode = false,
  setIsSplitMode,
  displayMode,
  setDisplayMode,
}) => {
  const isMultiFileActive = useMemo(() => selectedFiles.length > 1, [selectedFiles]);
  const virtuosoRef = useRef<any>(null);
  const [activeAnnotationTarget, setActiveAnnotationTarget] = useState<{ log: LogEntry; rect: DOMRect } | null>(null);

  const handleHeaderClick = (col: NonNullable<SortColumn>) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    setCurrentPage(p => p - 1);
    document.getElementById('feed-viewport')?.scrollTo(0, 0);
  };

  const handleNextPage = () => {
    setCurrentPage(p => p + 1);
    document.getElementById('feed-viewport')?.scrollTo(0, 0);
  };

  // Vim focus tracking and scroll syncing for Virtual Mode
  useEffect(() => {
    if (viewMode === 'virtual' && focusedIndex !== null && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: focusedIndex,
        align: 'center',
        behavior: 'auto'
      });
    }
  }, [focusedIndex, viewMode]);

  // AutoScroll when tailing is active and new logs arrive
  useEffect(() => {
    if (isTailing && autoScrollTail) {
      if (viewMode === 'virtual' && virtuosoRef.current && pageLogs.length > 0) {
        virtuosoRef.current.scrollToIndex({
          index: pageLogs.length - 1,
          align: 'end',
          behavior: 'smooth'
        });
      } else if (viewMode === 'paginated') {
        const viewport = document.getElementById('feed-viewport');
        if (viewport) {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [filteredLogs.length, isTailing, autoScrollTail, viewMode]);

  return (
    <>
      <div className="feed-header">
        <div className="feed-info">
          <span className="material-icons-round">wysiwyg</span>
          <span>
            {filteredLogs.length > 0 
              ? `Visualizando ${filteredLogs.length === parsedLogs.length 
                  ? `${filteredLogs.length} registros` 
                  : `${filteredLogs.length} de ${parsedLogs.length} registros (filtrado)`}` 
              : 'Visualizando 0 registros'}
          </span>
        </div>
        
        <div className="feed-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Virtual Scroll Switch */}
          <div className="viewmode-toggle-group">
            <button 
              className={`viewmode-toggle-btn ${viewMode === 'virtual' ? 'active' : ''}`}
              onClick={() => setViewMode('virtual')}
              title="Activar Scroll Infinito Virtualizado (Rendimiento 60 FPS)"
            >
              <span className="material-icons-round" style={{ fontSize: '14px' }}>bolt</span>
              Virtual
            </button>
            <button 
              className={`viewmode-toggle-btn ${viewMode === 'paginated' ? 'active' : ''}`}
              onClick={() => setViewMode('paginated')}
              title="Activar Paginación Clásica por Bloques"
            >
              <span className="material-icons-round" style={{ fontSize: '14px' }}>pages</span>
              Páginas
            </button>
          </div>

          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={wrapLines} 
              onChange={e => setWrapLines(e.target.checked)} 
            />
            <span className="slider"></span>
            <span className="toggle-label">Ajustar líneas</span>
          </label>

          <button 
            className="secondary-button download-logs-btn" 
            onClick={downloadFilteredLogs}
            title="Descargar logs filtrados en texto crudo .log"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              padding: '0 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s'
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '14px' }}>file_download</span>
            <span>Descargar</span>
          </button>

          {setIsSplitMode && (
            <button 
              className={`secondary-button ${isSplitMode ? 'active-accent-btn' : ''}`}
              onClick={(e) => { e.stopPropagation(); setIsSplitMode(!isSplitMode); }}
              title="Dividir pantalla para comparar feeds / archivos en paralelo"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '28px',
                padding: '0 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 500,
                background: isSplitMode ? 'var(--accent-bg)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid ' + (isSplitMode ? 'var(--accent-solid)' : 'var(--border-color)'),
                color: isSplitMode ? 'var(--accent-solid)' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '14px' }}>split_screen</span>
              <span>{isSplitMode ? 'Unir Pantalla' : 'Dividir Pantalla'}</span>
            </button>
          )}

          {/* Raw view toggle: shows the file content as plain text (no parser). */}
          <button
            className={`secondary-button ${displayMode === 'raw' ? 'active-accent-btn' : ''}`}
            onClick={() => setDisplayMode(displayMode === 'raw' ? 'parsed' : 'raw')}
            title="Alternar entre vista parseada (tabla) y vista raw (texto plano del archivo)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              padding: '0 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              background: displayMode === 'raw' ? 'var(--accent-bg)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid ' + (displayMode === 'raw' ? 'var(--accent-solid)' : 'var(--border-color)'),
              color: displayMode === 'raw' ? 'var(--accent-solid)' : 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s'
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '14px' }}>
              {displayMode === 'raw' ? 'table_view' : 'code'}
            </span>
            <span>{displayMode === 'raw' ? 'Ver Tabla' : 'Raw'}</span>
          </button>
        </div>
      </div>

      {displayMode === 'raw' ? (
        // MODO RAW: texto plano sin parsear. Útil para ver líneas que el
        // parser no entiende, copiar fragmentos crudos, etc.
        <RawLiveView selectedFiles={selectedFiles} />
      ) : filteredLogs.length === 0 ? (
        <div className={`feed-viewport ${wrapLines ? 'wrap-lines' : ''}`} id="feed-viewport">
          <div className="zero-state">
            <span className="material-icons-round zero-icon">
              {parsedLogs.length === 0 ? 'insert_drive_file' : 'search_off'}
            </span>
            <h3>{parsedLogs.length === 0 ? 'Ningún Archivo Seleccionado' : 'No se encontraron registros'}</h3>
            <p>
              {parsedLogs.length === 0 
                ? 'Por favor, selecciona un archivo de log de la barra lateral o arrastra uno nuevo aquí para analizarlo.' 
                : 'Ningún log coincide con tus filtros o término de búsqueda.'}
            </p>
          </div>
        </div>
      ) : viewMode === 'virtual' ? (
        // MODO 1: SCROLL INFINITO VIRTUALIZADO PREMIUM (60 FPS)
        <TableVirtuoso
          ref={virtuosoRef}
          data={pageLogs} // Contiene todos los logs en modo virtual
          className={`feed-viewport virtuoso-scroller ${wrapLines ? 'wrap-lines' : ''}`}
          style={{ flex: 1, minHeight: 0, outline: 'none', background: 'transparent' }}
          fixedHeaderContent={() => (
            <tr style={{ background: 'var(--bg-card)' }}>
              <th width="4%" className="pin-header" style={{ padding: '10px 8px' }}>Pin</th>
              <th width="4%" className="note-col" style={{ padding: '10px 8px' }}>Nota</th>
              {(['timestamp', 'level', 'service', 'correlationId', 'message'] as const).map(col => (
                <th 
                  key={col} 
                  width={
                    col === 'timestamp' 
                      ? '14%' 
                      : col === 'level' 
                        ? '12%' 
                        : col === 'service' 
                          ? '16%' 
                          : col === 'correlationId' 
                            ? '14%' 
                            : '40%'
                  }
                  className={`sortable-th ${sortColumn === col ? 'sort-active' : ''}`} 
                  onClick={() => handleHeaderClick(col)}
                  style={{ padding: '10px 8px' }}
                >
                  {{ 
                    timestamp: 'Marca de Tiempo', 
                    level: 'Nivel', 
                    service: 'Servicio / Método', 
                    correlationId: 'ID Correlación', 
                    message: 'Mensaje / Contenido' 
                  }[col]}
                  <span className="sort-indicator">
                    {sortColumn === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              ))}
            </tr>
          )}
          itemContent={(index, log) => {
            const lc = getLevelColor(log.level || 'INFO');
            const dateFormatted = (log.timestamp || '').split(',')[0] || '-';
            const logMsg = log.message || '';
            const snippet = logMsg.trim().replace(/\s+/g, ' ').slice(0, 120) + (logMsg.length > 120 ? '...' : '');
            const isPinned = pinnedKeys.has(`${log.originFile || 'upload'}::${log.originalId || log.id}`);
            const hasAnnotation = !!log.annotation;
            
            return (
              <>
                <td onClick={(e) => {
                  e.stopPropagation();
                  togglePin(log);
                }} style={{ cursor: 'pointer' }}>
                  <span 
                    className={`material-icons-round pin-icon ${isPinned ? 'active' : ''}`} 
                    title={isPinned ? "Quitar marcador" : "Fijar log (Marcador)"}
                  >
                    push_pin
                  </span>
                </td>
                <td className="note-col" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`note-icon-btn ${hasAnnotation ? 'has-note' : ''}`}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setActiveAnnotationTarget({
                        log,
                        rect
                      });
                    }}
                    title={hasAnnotation ? log.annotation : "Añadir anotación"}
                  >
                    <span className="material-icons-round">
                      {hasAnnotation ? 'chat_bubble' : 'add_comment'}
                    </span>
                  </button>
                </td>
                <td>
                  <div className="timestamp-cell">
                    <span className="log-timestamp">{dateFormatted}</span>
                    {log.deltaTimeMs !== undefined && (
                      <span 
                        className={`latency-badge ${
                          log.deltaTimeMs > 5000 
                            ? 'latency-danger' 
                            : log.deltaTimeMs > 1000 
                              ? 'latency-warning' 
                              : 'latency-normal'
                        }`} 
                        title={`Tiempo desde el log anterior del mismo flujo: ${log.deltaTimeMs}ms`}
                      >
                        +{log.deltaTimeMs >= 1000 ? `${(log.deltaTimeMs / 1000).toFixed(2)}s` : `${log.deltaTimeMs}ms`}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    {log.originFile && isMultiFileActive && (
                      <span 
                        className="file-origin-badge" 
                        style={getFileColorStyle(log.originFile)}
                        title={log.originFile}
                      >
                        {log.originFile}
                      </span>
                    )}
                    {log.customBadge && (
                      <span className="promotion-badge" title="Severidad de nivel elevada por regla de alerta QA">
                        <span className="material-icons-round" style={{ fontSize: '10px' }}>notification_important</span>
                        {log.customBadge}
                      </span>
                    )}
                    <span 
                      className="badge badge-outline" 
                      style={{ color: `hsl(${lc})`, borderColor: `hsla(${lc},0.4)`, background: `hsla(${lc},0.08)` }}
                    >
                      {log.level || 'INFO'}
                    </span>
                  </div>
                </td>
                <td>
                  {log.endpoint ? (
                    <button
                      className="badge badge-service endpoint-filter-btn"
                      title={`Filtrar por endpoint ${log.endpoint}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilters((p: any) => ({ ...p, endpointFilter: log.endpoint }));
                        setCurrentPage(1);
                      }}
                      style={{
                        cursor: 'pointer',
                        border: '1px solid var(--accent-solid)',
                        background: 'var(--accent-bg)',
                        color: 'var(--accent-solid)',
                        fontWeight: 600
                      }}
                    >
                      {log.service || `EP ${log.endpoint}`}
                    </button>
                  ) : (
                    <div className="badge badge-service" title={log.service || '-'}>{log.service || '-'}</div>
                  )}
                </td>
                <td>
                  {(log.correlationId || '-') !== '-' ? (
                    <div className="correlation-cell">
                      <span className="badge badge-correlation" title={log.correlationId}>{log.correlationId}</span>
                      <button 
                        className="icon-button trace-flow-btn" 
                        title="Aislar flujo de esta petición"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilters((p: any) => ({ ...p, correlationId: log.correlationId }));
                          setCurrentPage(1);
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: 13 }}>filter_alt</span>
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                  )}
                </td>
                <td><div className="log-message-cell">{highlightText(snippet, searchTerm, isRegexSearch)}</div></td>
              </>
            );
          }}
          components={{
            Table: (props) => <table {...props} className="logs-table" style={{ borderCollapse: 'collapse', width: '100%' }} />,
            TableRow: (props) => {
              const index = props['data-index'];
              const log = pageLogs[index];
              if (!log) return <tr {...props} />;
              
              const isPinned = pinnedKeys.has(`${log.originFile || 'upload'}::${log.originalId || log.id}`);
              const isFocused = focusedIndex === index;
              const isActive = activeLog?.id === log.id;
              
              return (
                <tr 
                  {...props} 
                  id={`log-row-${log.id}`} 
                  className={`${props.className || ''} ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-row' : ''} ${isFocused ? 'keyboard-focused' : ''}`}
                  onClick={() => { 
                    setFocusedIndex(index);
                    setActiveLog(log); 
                    setIsDrawerOpen(true); 
                  }}
                  style={{ cursor: 'pointer' }}
                />
              );
            }
          }}
        />
      ) : (
        // MODO 2: PAGINACIÓN TRADICIONAL CLÁSICA
        <div className={`feed-viewport ${wrapLines ? 'wrap-lines' : ''}`} id="feed-viewport">
          <table className="logs-table">
            <thead>
              <tr>
                <th width="4%" className="pin-header">Pin</th>
                <th width="4%" className="note-col">Nota</th>
                {(['timestamp', 'level', 'service', 'correlationId', 'message'] as const).map(col => (
                  <th 
                    key={col} 
                    width={
                      col === 'timestamp' 
                        ? '14%' 
                        : col === 'level' 
                          ? '12%' 
                          : col === 'service' 
                            ? '16%' 
                            : col === 'correlationId' 
                              ? '14%' 
                              : '40%'
                    }
                    className={`sortable-th ${sortColumn === col ? 'sort-active' : ''}`} 
                    onClick={() => handleHeaderClick(col)}
                  >
                    {{ 
                      timestamp: 'Marca de Tiempo', 
                      level: 'Nivel', 
                      service: 'Servicio / Método', 
                      correlationId: 'ID Correlación', 
                      message: 'Mensaje / Contenido' 
                    }[col]}
                    <span className="sort-indicator">
                      {sortColumn === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageLogs.map((log, index) => {
                const lc = getLevelColor(log.level || 'INFO');
                const dateFormatted = (log.timestamp || '').split(',')[0] || '-';
                const logMsg = log.message || '';
                const snippet = logMsg.trim().replace(/\s+/g, ' ').slice(0, 120) + (logMsg.length > 120 ? '...' : '');
                const isPinned = pinnedKeys.has(`${log.originFile || 'upload'}::${log.originalId || log.id}`);
                const globalIndex = pageStart + index;
                const isFocused = focusedIndex === globalIndex;
                const hasAnnotation = !!log.annotation;
                
                return (
                  <tr 
                    key={log.id} 
                    id={`log-row-${log.id}`} 
                    className={`${activeLog?.id === log.id ? 'active-row' : ''} ${isPinned ? 'pinned-row' : ''} ${isFocused ? 'keyboard-focused' : ''}`}
                    onClick={() => { 
                      setFocusedIndex(globalIndex);
                      setActiveLog(log); 
                      setIsDrawerOpen(true); 
                    }}
                  >
                    <td onClick={(e) => {
                      e.stopPropagation();
                      togglePin(log);
                    }}>
                      <span 
                        className={`material-icons-round pin-icon ${isPinned ? 'active' : ''}`} 
                        title={isPinned ? "Quitar marcador" : "Fijar log (Marcador)"}
                      >
                        push_pin
                      </span>
                    </td>
                    <td className="note-col" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`note-icon-btn ${hasAnnotation ? 'has-note' : ''}`}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setActiveAnnotationTarget({
                            log,
                            rect
                          });
                        }}
                        title={hasAnnotation ? log.annotation : "Añadir anotación"}
                      >
                        <span className="material-icons-round">
                          {hasAnnotation ? 'chat_bubble' : 'add_comment'}
                        </span>
                      </button>
                    </td>
                    <td>
                      <div className="timestamp-cell">
                        <span className="log-timestamp">{dateFormatted}</span>
                        {log.deltaTimeMs !== undefined && (
                          <span 
                            className={`latency-badge ${
                              log.deltaTimeMs > 5000 
                                ? 'latency-danger' 
                                : log.deltaTimeMs > 1000 
                                  ? 'latency-warning' 
                                  : 'latency-normal'
                            }`} 
                            title={`Tiempo desde el log anterior del mismo flujo: ${log.deltaTimeMs}ms`}
                          >
                            +{log.deltaTimeMs >= 1000 ? `${(log.deltaTimeMs / 1000).toFixed(2)}s` : `${log.deltaTimeMs}ms`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        {log.originFile && isMultiFileActive && (
                          <span 
                            className="file-origin-badge" 
                            style={getFileColorStyle(log.originFile)}
                            title={log.originFile}
                          >
                            {log.originFile}
                          </span>
                        )}
                        {log.customBadge && (
                          <span className="promotion-badge" title="Severidad de nivel elevada por regla de alerta QA">
                            <span className="material-icons-round" style={{ fontSize: '10px' }}>notification_important</span>
                            {log.customBadge}
                          </span>
                        )}
                        <span 
                          className="badge badge-outline"
                          style={{ color: `hsl(${lc})`, borderColor: `hsla(${lc},0.4)`, background: `hsla(${lc},0.08)` }}
                        >
                          {log.level || 'INFO'}
                        </span>
                      </div>
                    </td>
                    <td>
                      {log.endpoint ? (
                        <button
                          className="badge badge-service endpoint-filter-btn"
                          title={`Filtrar por endpoint ${log.endpoint}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilters((p: any) => ({ ...p, endpointFilter: log.endpoint }));
                            setCurrentPage(1);
                          }}
                          style={{
                            cursor: 'pointer',
                            border: '1px solid var(--accent-solid)',
                            background: 'var(--accent-bg)',
                            color: 'var(--accent-solid)',
                            fontWeight: 600
                          }}
                        >
                          {log.service || `EP ${log.endpoint}`}
                        </button>
                      ) : (
                        <div className="badge badge-service" title={log.service || '-'}>{log.service || '-'}</div>
                      )}
                    </td>
                    <td>
                      {(log.correlationId || '-') !== '-' ? (
                        <div className="correlation-cell">
                          <span className="badge badge-correlation" title={log.correlationId}>{log.correlationId}</span>
                          <button 
                            className="icon-button trace-flow-btn" 
                            title="Aislar flujo de esta petición"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilters((p: any) => ({ ...p, correlationId: log.correlationId }));
                              setCurrentPage(1);
                            }}
                          >
                            <span className="material-icons-round" style={{ fontSize: 13 }}>filter_alt</span>
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td><div className="log-message-cell">{highlightText(snippet, searchTerm, isRegexSearch)}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="feed-footer">
        <div className="pagination-info">
          {filteredLogs.length === 0 
            ? 'Mostrando registros 0-0' 
            : viewMode === 'virtual'
              ? `Visualizando todos los ${filteredLogs.length} registros (Scroll Virtualizado)`
              : `Mostrando registros ${pageStart + 1}-${Math.min(pageStart + 200, filteredLogs.length)} de ${filteredLogs.length}`}
        </div>
        {viewMode === 'paginated' && (
          <div className="pagination-buttons">
            <button 
              id="btn-prev-page" 
              className="secondary-button" 
              disabled={currentPage <= 1} 
              onClick={handlePrevPage}
            >
              <span className="material-icons-round">chevron_left</span> Anterior
            </button>
            <span className="page-indicator">Página {currentPage} de {totalPages}</span>
            <button 
              id="btn-next-page" 
              className="secondary-button" 
              disabled={currentPage >= totalPages} 
              onClick={handleNextPage}
            >
              Siguiente <span className="material-icons-round">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      {activeAnnotationTarget && (
        <AnnotationPopover
          initialText={activeAnnotationTarget.log.annotation || ''}
          onSave={(text) => {
            saveAnnotation(activeAnnotationTarget.log, text);
            setActiveAnnotationTarget(null);
          }}
          onDelete={() => {
            saveAnnotation(activeAnnotationTarget.log, '');
            setActiveAnnotationTarget(null);
          }}
          onClose={() => setActiveAnnotationTarget(null)}
          position={{
            x: activeAnnotationTarget.rect.right + 10,
            y: activeAnnotationTarget.rect.top
          }}
          logId={activeAnnotationTarget.log.id}
        />
      )}
    </>
  );
};
