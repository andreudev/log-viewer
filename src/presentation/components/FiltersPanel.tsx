import React, { useState, useMemo } from 'react';
import { FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { LogLevel } from '../../domain/models/LogEntry';
import { defaultLevels } from '../../domain/parsing/parseLogs';
import { getLevelColor } from '../utils/constants';
import { SearchableSelect } from './SearchableSelect';
import { IconButton } from './IconButton';
import { LogEntry } from '../../domain/models/LogEntry';
import { FilterPreset } from '../../domain/models/FilterPreset';

// Subcomponentes extraídos
import { UmlDiagram } from './filters/UmlDiagram';
import { DateRangePicker } from './filters/DateRangePicker';
import { QuickFilterPills } from './filters/QuickFilterPills';
import { TailIndicator } from './TailIndicator';
import { FilterPresetsPanel } from './filters/FilterPresetsPanel';
import { LogTimeline } from './filters/LogTimeline';

interface FiltersPanelProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  uniqueServices: string[];
  handleLevelClick: (level: LogLevel) => void;
  setSortColumn: React.Dispatch<React.SetStateAction<SortColumn>>;
  setSortDirection: React.Dispatch<React.SetStateAction<SortDirection>>;
  logDateRange: { min: Date | null; max: Date | null; minStr: string; maxStr: string };
  applyTimePreset: (minutes: number) => void;
  applyFullDateRange: () => void;
  filteredLogs: LogEntry[];
  parsedLogs: LogEntry[];
  setActiveLog: (log: LogEntry | null) => void;
  setIsDrawerOpen: (isOpen: boolean) => void;
  availableLevels: string[];

  // Live Tailing
  isTailing: boolean;
  setIsTailing: React.Dispatch<React.SetStateAction<boolean>>;
  isTailPaused: boolean;
  setIsTailPaused: React.Dispatch<React.SetStateAction<boolean>>;
  autoScrollTail: boolean;
  setAutoScrollTail: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFiles: string[];
  tailBufferLimit: number;
  setTailBufferLimit: (limit: number) => void;
  pausedLogsCount: number;

  // Presets
  presets: FilterPreset[];
  activePresetId: string | null;
  saveCurrentAsPreset: (name: string, icon: string) => void;
  applyPreset: (preset: FilterPreset) => void;
  deletePreset: (id: string) => void;
}

export const FiltersPanel: React.FC<FiltersPanelProps> = ({
  filters,
  setFilters,
  resetFilters,
  setCurrentPage,
  uniqueServices,
  handleLevelClick,
  setSortColumn,
  setSortDirection,
  logDateRange,
  applyTimePreset,
  applyFullDateRange,
  filteredLogs,
  parsedLogs,
  setActiveLog,
  setIsDrawerOpen,
  availableLevels,

  isTailing,
  setIsTailing,
  isTailPaused,
  setIsTailPaused,
  autoScrollTail,
  setAutoScrollTail,
  selectedFiles,
  tailBufferLimit,
  setTailBufferLimit,
  pausedLogsCount,

  presets,
  activePresetId,
  saveCurrentAsPreset,
  applyPreset,
  deletePreset
}) => {
  const [isUmlCollapsed, setIsUmlCollapsed] = useState(false);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('searchHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  const saveToHistory = (term: string) => {
    if (!term || term.trim().length < 2) return;
    const cleanTerm = term.trim();
    setSearchHistory(prev => {
      const filtered = prev.filter(x => x !== cleanTerm);
      const next = [cleanTerm, ...filtered].slice(0, 10);
      localStorage.setItem('searchHistory', JSON.stringify(next));
      return next;
    });
  };

  const activeLevels = useMemo(() => {
    return filters.activeLevels instanceof Set 
      ? filters.activeLevels 
      : new Set(filters.activeLevels || []);
  }, [filters.activeLevels]);

  // Compute number of active advanced filters to show in a badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    
    // 1. Levels filtered (if some are excluded)
    if (activeLevels.size > 0 && activeLevels.size < availableLevels.length) {
      count++;
    }
    
    // 2. Service selected is not ALL
    if (filters.activeService && filters.activeService !== 'ALL') {
      count++;
    }

    // 2b. Endpoint filter active
    if (filters.endpointFilter && filters.endpointFilter.trim()) {
      count++;
    }

    // 3. Date range limits set
    if (filters.dateFrom || filters.dateTo) {
      count++;
    }
    
    // 4. Quick filter active
    if (filters.quickFilter && filters.quickFilter !== 'NONE') {
      count++;
    }
    
    // 5. Correlation ID active
    if (filters.correlationId) {
      count++;
    }
    
    // 6. Payloads only active
    if (filters.isPayloadsOnly) {
      count++;
    }
    
    return count;
  }, [filters, activeLevels, availableLevels]);

  return (
    <section className="filter-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* UML Diagram (if active correlation ID) */}
      {filters.correlationId && (
        <UmlDiagram
          filteredLogs={filteredLogs}
          isUmlCollapsed={isUmlCollapsed}
          setIsUmlCollapsed={setIsUmlCollapsed}
          setActiveLog={setActiveLog}
          setIsDrawerOpen={setIsDrawerOpen}
          setFilters={setFilters}
          correlationId={filters.correlationId}
        />
      )}

      {/* Log Density Timeline (if toggle is on) */}
      {showTimeline && (
        <LogTimeline
          parsedLogs={parsedLogs}
          filters={filters}
          setFilters={setFilters}
          setCurrentPage={setCurrentPage}
        />
      )}

      {/* Reset filters button — only visible when at least one filter is active.
          Avoids the "stuck with no results, can't figure out why" UX dead-end. */}
      {activeFiltersCount > 0 && (
        <button
          type="button"
          className="reset-filters-btn"
          onClick={resetFilters}
          aria-label={`Limpiar ${activeFiltersCount} filtros activos`}
          title={`Limpiar ${activeFiltersCount} filtros y volver a la vista sin filtros`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: 'var(--bg-panel, rgba(255,255,255,0.05))',
            border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
            borderRadius: '6px',
            color: 'var(--text-primary, #e0e0e0)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'background 120ms ease, border-color 120ms ease',
            width: '100%'
          }}
        >
          <span className="material-icons-round" style={{ fontSize: '16px' }} aria-hidden="true">filter_alt_off</span>
          <span>Limpiar filtros ({activeFiltersCount})</span>
        </button>
      )}
      
      {/* Primary search row */}
      <div className="filter-row search-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        <div className="search-input-wrapper" style={{ position: 'relative', flex: 1 }}>
          <span className="material-icons-round search-icon">search</span>
          <input 
            type="text" 
            id="search-input" 
            placeholder="Buscar por método, mensaje, IP, ID de correlación o payload..." 
            value={filters.searchTerm}
            onChange={e => { setFilters(p => ({ ...p, searchTerm: e.target.value })); setCurrentPage(1); }} 
            onFocus={() => setShowHistoryDropdown(true)}
            onBlur={() => {
              saveToHistory(filters.searchTerm);
              setTimeout(() => setShowHistoryDropdown(false), 200);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                saveToHistory(filters.searchTerm);
              }
            }}
            autoComplete="off"
          />
          {filters.searchTerm && (
            <button
              type="button"
              className="clear-search-btn"
              aria-label="Limpiar busqueda"
              title="Limpiar busqueda"
              onClick={() => { setFilters(p => ({ ...p, searchTerm: '' })); setCurrentPage(1); }}
            >
              <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
          )}

          {showHistoryDropdown && searchHistory.length > 0 && (
            <div className="search-history-dropdown" style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              width: '100%',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 1000,
              padding: '6px 0',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
                <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Búsquedas Recientes</span>
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchHistory([]);
                    localStorage.removeItem('searchHistory');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '9px',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Limpiar Todo
                </button>
              </div>
              {searchHistory.map((item, idx) => (
                <div 
                  key={idx}
                  className="history-item-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    color: 'var(--text-secondary)'
                  }}
                  onMouseDown={() => {
                    setFilters(p => ({ ...p, searchTerm: item }));
                    setCurrentPage(1);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>history</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSearchHistory(prev => {
                        const next = prev.filter(x => x !== item);
                        localStorage.setItem('searchHistory', JSON.stringify(next));
                        return next;
                      });
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px'
                    }}
                  >
                    <span className="material-icons-round" style={{ fontSize: '14px' }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Primary Row Option Pills */}
        <div className="search-options" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button 
            className={`option-pill ${filters.isRegexSearch ? 'active' : ''}`} 
            onClick={() => { setFilters(p => ({ ...p, isRegexSearch: !p.isRegexSearch })); setCurrentPage(1); }}
          >
            RegEx
          </button>
          
          <button 
            className={`option-pill ${filters.isPayloadsOnly ? 'active' : ''}`} 
            onClick={() => { setFilters(p => ({ ...p, isPayloadsOnly: !p.isPayloadsOnly })); setCurrentPage(1); }}
          >
            Con Payloads
          </button>

          <button 
            type="button"
            className={`option-pill ${showTimeline ? 'active' : ''}`} 
            onClick={() => setShowTimeline(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <span className="material-icons-round" style={{ fontSize: '14px' }}>analytics</span>
            <span>Telemetría</span>
          </button>

          {/* Toggle Advanced Drawer Button */}
          <button 
            type="button"
            className={`option-pill ${isAdvancedExpanded ? 'active' : ''}`} 
            onClick={() => setIsAdvancedExpanded(prev => !prev)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              border: isAdvancedExpanded ? '1px solid var(--accent-solid)' : '1px solid var(--border-color)',
              background: isAdvancedExpanded ? 'var(--accent-bg)' : 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '14px', color: isAdvancedExpanded ? 'var(--accent-solid)' : 'var(--text-secondary)' }}>tune</span>
            <span>Filtros Avanzados</span>
            {activeFiltersCount > 0 && (
              <span style={{
                background: 'var(--accent-solid)',
                color: '#fff',
                borderRadius: '50%',
                width: '16px',
                height: '16px',
                fontSize: '9.5px',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '2px'
              }}>
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Secondary Drawer: Advanced Filters (Collapsible) */}
      {isAdvancedExpanded && (
        <div 
          className="advanced-filters-drawer"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '16px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            animation: 'tail-fade-in 0.2s ease-out'
          }}
        >
          {/* Presets and Tail Watcher Indicators */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '10px' }}>
            <FilterPresetsPanel
              presets={presets}
              activePresetId={activePresetId}
              onApplyPreset={applyPreset}
              onDeletePreset={deletePreset}
              onSaveCurrentFilter={saveCurrentAsPreset}
            />

            <TailIndicator
              isTailing={isTailing}
              isTailPaused={isTailPaused}
              autoScrollTail={autoScrollTail}
              onToggleTailing={() => setIsTailing(prev => !prev)}
              onTogglePause={() => setIsTailPaused(prev => !prev)}
              onToggleAutoScroll={() => setAutoScrollTail(prev => !prev)}
              activeFilename={selectedFiles[0] || null}
              tailBufferLimit={tailBufferLimit}
              setTailBufferLimit={setTailBufferLimit}
              pausedLogsCount={pausedLogsCount}
            />
          </div>

          {/* Quick Filter Pills Row */}
          <QuickFilterPills
            filters={filters}
            setFilters={setFilters}
            setCurrentPage={setCurrentPage}
          />

          {/* Advanced Control Row (Level selector, Service selector, Date Range Picker, Reset) */}
          <div className="filter-row control-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: 0 }}>
            {/* Level selection pills */}
            <div className="level-pills">
              <span className="filter-group-label">NIVEL:</span>
              <button 
                className={`option-pill level-all-pill ${activeLevels.size === availableLevels.length ? 'active' : ''}`}
                onClick={() => { setFilters(p => ({ ...p, activeLevels: new Set(availableLevels) })); setCurrentPage(1); }}
              >
                <span>TODOS</span>
              </button>
              {availableLevels.map(level => {
                const active = activeLevels.has(level);
                const color = getLevelColor(level);
                const activeStyle = active ? {
                  backgroundColor: `hsla(${color}, 0.12)`,
                  borderColor: `hsl(${color})`,
                  color: `hsl(${color})`
                } : {};
                return (
                  <button 
                    key={level} 
                    className={`level-pill level-${level.toLowerCase()}-pill ${active ? 'active' : ''}`}
                    style={activeStyle}
                    onClick={() => handleLevelClick(level)}
                  >
                    {level}
                  </button>
                );
              })}
            </div>

            {/* Dropdown filters and reset action */}
            <div className="dropdown-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <SearchableSelect
                options={[
                  { value: 'ALL', label: 'Todos los Servicios' },
                  ...uniqueServices.map(s => ({ value: s, label: s }))
                ]}
                value={filters.activeService}
                onChange={val => {
                  setFilters(p => ({ ...p, activeService: val }));
                  setCurrentPage(1);
                }}
                placeholder="Todos los Servicios"
                icon="dns"
              />

              <div
                title="Buscar por código de endpoint (ej: 1015). Aplica sobre el campo Endpoint extraído del log."
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid ' + (filters.endpointFilter ? 'var(--accent-solid)' : 'var(--border-color)'),
                  borderRadius: '6px',
                  padding: '0 8px 0 26px',
                  height: '32px',
                  minWidth: '160px'
                }}
              >
                <span
                  className="material-icons-round"
                  style={{
                    position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '14px', color: 'var(--text-muted)', pointerEvents: 'none'
                  }}
                >
                  api
                </span>
                <input
                  type="text"
                  aria-label="Buscar por endpoint"
                  placeholder="EP endpoint (ej: 1015)"
                  value={filters.endpointFilter || ''}
                  onChange={e => {
                    setFilters(p => ({ ...p, endpointFilter: e.target.value || null }));
                    setCurrentPage(1);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    width: '100%',
                    minWidth: '120px'
                  }}
                />
                {filters.endpointFilter && (
                  <button
                    className="icon-button"
                    title="Limpiar filtro de endpoint"
                    onClick={() => {
                      setFilters(p => ({ ...p, endpointFilter: null }));
                      setCurrentPage(1);
                    }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, marginLeft: '4px' }}
                  >
                    <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                  </button>
                )}
              </div>

              <DateRangePicker
                filters={filters}
                setFilters={setFilters}
                setCurrentPage={setCurrentPage}
                logDateRange={logDateRange}
                applyTimePreset={applyTimePreset}
                applyFullDateRange={applyFullDateRange}
              />

              <button 
                id="btn-reset-filters" 
                className="secondary-button" 
                style={{
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px'
                }}
                onClick={() => { 
                  setFilters({ 
                    activeLevels: defaultLevels(), 
                    activeService: 'ALL', 
                    searchTerm: '', 
                    isRegexSearch: false,
                    isPayloadsOnly: false,
                    dateFrom: null,
                    dateTo: null,
                    correlationId: null,
                    endpointFilter: null
                  }); 
                  setSortColumn(null); 
                  setSortDirection('asc'); 
                  setCurrentPage(1); 
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '16px' }}>restart_alt</span> 
                Reestablecer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
