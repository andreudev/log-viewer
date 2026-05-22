import React, { useMemo } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { getFileColorStyle, highlightText } from '../utils/helpers';
import { getLevelColor } from '../utils/constants';

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
  setWrapLines
}) => {
  const isMultiFileActive = useMemo(() => selectedFiles.length > 1, [selectedFiles]);

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
        <div className="feed-actions">
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={wrapLines} 
              onChange={e => setWrapLines(e.target.checked)} 
            />
            <span className="slider"></span>
            <span className="toggle-label">Ajustar líneas</span>
          </label>
        </div>
      </div>
      
      <div className={`feed-viewport ${wrapLines ? 'wrap-lines' : ''}`} id="feed-viewport">
        {filteredLogs.length === 0 ? (
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
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th width="4%" className="pin-header">Pin</th>
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
                    <td><div className="badge badge-service" title={log.service || '-'}>{log.service || '-'}</div></td>
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
        )}
      </div>
      
      <div className="feed-footer">
        <div className="pagination-info">
          {filteredLogs.length === 0 
            ? 'Mostrando registros 0-0' 
            : `Mostrando registros ${pageStart + 1}-${Math.min(pageStart + 200, filteredLogs.length)} de ${filteredLogs.length}`}
        </div>
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
      </div>
    </>
  );
};
