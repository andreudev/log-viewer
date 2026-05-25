import React, { useState } from 'react';
import { FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { LogLevel } from '../../domain/models/LogEntry';
import { defaultLevels } from '../../domain/parsing/parseLogs';
import { getLevelColor } from '../utils/constants';
import { SearchableSelect } from './SearchableSelect';
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

  presets,
  activePresetId,
  saveCurrentAsPreset,
  applyPreset,
  deletePreset
}) => {
  const [isUmlCollapsed, setIsUmlCollapsed] = useState(false);

  const activeLevels = filters.activeLevels instanceof Set 
    ? filters.activeLevels 
    : new Set(filters.activeLevels || []);

  return (
    <section className="filter-panel">
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

      <TailIndicator
        isTailing={isTailing}
        isTailPaused={isTailPaused}
        autoScrollTail={autoScrollTail}
        onToggleTailing={() => setIsTailing(prev => !prev)}
        onTogglePause={() => setIsTailPaused(prev => !prev)}
        onToggleAutoScroll={() => setAutoScrollTail(prev => !prev)}
        activeFilename={selectedFiles[0] || null}
      />

      <FilterPresetsPanel
        presets={presets}
        activePresetId={activePresetId}
        onApplyPreset={applyPreset}
        onDeletePreset={deletePreset}
        onSaveCurrentFilter={saveCurrentAsPreset}
      />

      <LogTimeline
        parsedLogs={parsedLogs}
        filters={filters}
        setFilters={setFilters}
        setCurrentPage={setCurrentPage}
      />
      
      <div className="filter-row search-row">
        <div className="search-input-wrapper">
          <span className="material-icons-round search-icon">search</span>
          <input 
            type="text" 
            id="search-input" 
            placeholder="Buscar por método, mensaje, IP, ID de correlación o payload..." 
            value={filters.searchTerm}
            onChange={e => { setFilters(p => ({ ...p, searchTerm: e.target.value })); setCurrentPage(1); }} 
          />
          {filters.searchTerm && (
            <button 
              className="clear-search-btn" 
              onClick={() => { setFilters(p => ({ ...p, searchTerm: '' })); setCurrentPage(1); }}
            >
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>
        <div className="search-options">
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
        </div>
      </div>

      <QuickFilterPills
        filters={filters}
        setFilters={setFilters}
        setCurrentPage={setCurrentPage}
      />

      <div className="filter-row control-row">
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

        <div className="dropdown-filters">
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
            onClick={() => { 
              setFilters({ 
                activeLevels: defaultLevels(), 
                activeService: 'ALL', 
                searchTerm: '', 
                isRegexSearch: false, 
                isPayloadsOnly: false, 
                dateFrom: null, 
                dateTo: null, 
                correlationId: null 
              }); 
              setSortColumn(null); 
              setSortDirection('asc'); 
              setCurrentPage(1); 
            }}
          >
            <span className="material-icons-round">restart_alt</span> Reestablecer
          </button>
        </div>
      </div>
    </section>
  );
};
