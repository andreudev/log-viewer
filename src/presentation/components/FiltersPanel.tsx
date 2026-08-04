import React, { useMemo } from 'react';
import { FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { defaultLevels } from '../../domain/parsing/parseLogs';
import { SearchableSelect } from './SearchableSelect';
import { IconButton } from './IconButton';
import { DateRangePicker } from './filters/DateRangePicker';
import { TailIndicator } from './TailIndicator';

interface FiltersPanelProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  uniqueServices: string[];
  setSortColumn: React.Dispatch<React.SetStateAction<SortColumn>>;
  setSortDirection: React.Dispatch<React.SetStateAction<SortDirection>>;
  logDateRange: { min: Date | null; max: Date | null; minStr: string; maxStr: string };
  applyTimePreset: (minutes: number) => void;
  applyFullDateRange: () => void;

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
}

/**
 * Panel de filtros minimal para LogScope.
 *
 * Tras el refactor de UI el usuario pidio quedarse solo con lo esencial
 * para inspeccionar logs en vivo:
 *
 *   Fila 1: Servicio | Endpoint | Buscador libre | Limpiar todo
 *   Fila 2: Rango de tiempo (DateRangePicker) + TailIndicator (toggle/pause/auto-scroll/buffer)
 *
 * Lo que se elimino (decidido por el usuario):
 * - Pills de nivel (TODOS/TRACE/DEBUG/INFO/WARN/ERROR/REQ/RESP): demasiado ruido.
 *   Los logs se ven tal cual llegan del servidor.
 * - Historial de busquedas con persistencia en localStorage: distrae.
 * - Subcomponentes UmlDiagram y LogTimeline: ya no se renderizan.
 * - FilterPresetsPanel + boton "Guardar filtro": fuera de scope.
 * - Drawer collapsable "Filtros Avanzados": ahora todo esta siempre visible.
 */
export const FiltersPanel: React.FC<FiltersPanelProps> = ({
  filters,
  setFilters,
  resetFilters,
  setCurrentPage,
  uniqueServices,
  setSortColumn,
  setSortDirection,
  logDateRange,
  applyTimePreset,
  applyFullDateRange,
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
}) => {
  // Contador minimal: solo lo que realmente esta filtrando la vista.
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.activeService && filters.activeService !== 'ALL') count++;
    if (filters.endpointFilter && filters.endpointFilter.trim()) count++;
    if (filters.searchTerm && filters.searchTerm.trim()) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.isRegexSearch) count++;
    if (filters.isPayloadsOnly) count++;
    if (filters.correlationId) count++;
    return count;
  }, [filters]);

  const handleResetAll = () => {
    setFilters({
      activeLevels: defaultLevels(),
      activeService: 'ALL',
      searchTerm: '',
      isRegexSearch: false,
      isPayloadsOnly: false,
      dateFrom: null,
      dateTo: null,
      correlationId: null,
      endpointFilter: null,
    });
    setSortColumn(null);
    setSortDirection('asc');
    setCurrentPage(1);
    resetFilters();
  };

  return (
    <section
      className="filter-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      {/* Fila 1: Servicio + Endpoint + Buscador + Limpiar */}
      <div
        className="filter-row search-row"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}
      >
        <SearchableSelect
          options={[
            { value: 'ALL', label: 'Todos los Servicios' },
            ...uniqueServices.map((s) => ({ value: s, label: s })),
          ]}
          value={filters.activeService}
          onChange={(val) => {
            setFilters((p) => ({ ...p, activeService: val }));
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
            border:
              '1px solid ' +
              (filters.endpointFilter ? 'var(--accent-solid)' : 'var(--border-color)'),
            borderRadius: '6px',
            padding: '0 8px 0 26px',
            height: '32px',
            minWidth: '160px',
          }}
        >
          <span
            className="material-icons-round"
            style={{
              position: 'absolute',
              left: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '14px',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          >
            api
          </span>
          <input
            type="text"
            aria-label="Buscar por endpoint"
            placeholder="EP endpoint (ej: 1015)"
            value={filters.endpointFilter || ''}
            onChange={(e) => {
              setFilters((p) => ({ ...p, endpointFilter: e.target.value || null }));
              setCurrentPage(1);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '12px',
              width: '100%',
              minWidth: '120px',
            }}
          />
          {filters.endpointFilter && (
            <IconButton
              icon="close"
              label="Limpiar filtro de endpoint"
              onClick={() => {
                setFilters((p) => ({ ...p, endpointFilter: null }));
                setCurrentPage(1);
              }}
            />
          )}
        </div>

        <div className="search-input-wrapper" style={{ position: 'relative', flex: 1 }}>
          <span className="material-icons-round search-icon">search</span>
          <input
            type="text"
            id="search-input"
            placeholder="Buscar por método, mensaje, IP, ID de correlación o payload..."
            value={filters.searchTerm}
            onChange={(e) => {
              setFilters((p) => ({ ...p, searchTerm: e.target.value }));
              setCurrentPage(1);
            }}
            autoComplete="off"
          />
          {filters.searchTerm && (
            <button
              type="button"
              className="clear-search-btn"
              aria-label="Limpiar busqueda"
              title="Limpiar busqueda"
              onClick={() => {
                setFilters((p) => ({ ...p, searchTerm: '' }));
                setCurrentPage(1);
              }}
            >
              <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
          )}
        </div>

        <div className="search-options" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className={`option-pill ${filters.isRegexSearch ? 'active' : ''}`}
            onClick={() => {
              setFilters((p) => ({ ...p, isRegexSearch: !p.isRegexSearch }));
              setCurrentPage(1);
            }}
          >
            RegEx
          </button>

          <button
            className={`option-pill ${filters.isPayloadsOnly ? 'active' : ''}`}
            onClick={() => {
              setFilters((p) => ({ ...p, isPayloadsOnly: !p.isPayloadsOnly }));
              setCurrentPage(1);
            }}
          >
            Con Payloads
          </button>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              className="reset-filters-btn"
              onClick={handleResetAll}
              aria-label={`Limpiar ${activeFiltersCount} filtros activos`}
              title={`Limpiar ${activeFiltersCount} filtros activos`}
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
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '16px' }} aria-hidden="true">filter_alt_off</span>
              <span>Limpiar ({activeFiltersCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Fila 2: Rango de tiempo + Tail controls */}
      <div
        className="filter-row control-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <DateRangePicker
          filters={filters}
          setFilters={setFilters}
          setCurrentPage={setCurrentPage}
          logDateRange={logDateRange}
          applyTimePreset={applyTimePreset}
          applyFullDateRange={applyFullDateRange}
        />

        <TailIndicator
          isTailing={isTailing}
          isTailPaused={isTailPaused}
          autoScrollTail={autoScrollTail}
          onToggleTailing={() => setIsTailing((prev) => !prev)}
          onTogglePause={() => setIsTailPaused((prev) => !prev)}
          onToggleAutoScroll={() => setAutoScrollTail((prev) => !prev)}
          activeFilename={selectedFiles[0] || null}
          tailBufferLimit={tailBufferLimit}
          setTailBufferLimit={setTailBufferLimit}
          pausedLogsCount={pausedLogsCount}
        />
      </div>
    </section>
  );
};