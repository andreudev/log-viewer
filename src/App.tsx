import { useMemo, useState } from 'react';
import { useLogViewerState } from './presentation/hooks/useLogViewerState';
import { useKeyboardShortcuts } from './presentation/hooks/useKeyboardShortcuts';
import { Sidebar } from './presentation/components/Sidebar';
import { FiltersPanel } from './presentation/components/FiltersPanel';
import { LogsTable } from './presentation/components/LogsTable';
import { DetailsDrawer } from './presentation/components/DetailsDrawer';
import { CompareModal } from './presentation/components/CompareModal';
import { RulesModal } from './presentation/components/RulesModal';
import { ShortcutsModal } from './presentation/components/ShortcutsModal';
import { AnalyticsDashboard } from './presentation/components/AnalyticsDashboard';
import { getLevelColor } from './presentation/utils/constants';
import { LogLevel } from './domain/models/LogEntry';
import { ParserModal } from './presentation/components/ParserModal';

export function App() {
  const state = useLogViewerState();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const KPI_CARDS = useMemo(() => [
    { 
      icon: 'receipt_long', 
      label: 'Logs Parseados', 
      value: state.stats.total, 
      sub: state.selectedFiles.length > 0 ? `${state.selectedFiles.length} archivos seleccionados` : 'Ningún archivo', 
      cls: 'blue' 
    },
    { 
      icon: 'error_outline', 
      label: 'Errores Detectados', 
      value: state.stats.errorCount, 
      sub: state.stats.total ? `${((state.stats.errorCount / state.stats.total) * 100).toFixed(1)}% del total` : '0%', 
      cls: 'red' 
    },
    { 
      icon: 'warning_amber', 
      label: 'Advertencias (Warn)', 
      value: state.stats.warnCount, 
      sub: 'Alertas en ejecución', 
      cls: 'yellow' 
    },
    { 
      icon: 'dns', 
      label: 'Servicios Únicos', 
      value: state.stats.uniqueServices, 
      sub: `${state.stats.uniqueServices} endpoints`, 
      cls: 'purple' 
    }
  ], [state.stats, state.selectedFiles]);

  // Vim & Gmail like Keyboard Shortcuts hook
  useKeyboardShortcuts({
    focusedIndex: state.focusedIndex,
    setFocusedIndex: state.setFocusedIndex,
    maxIndex: state.filteredLogs.length,
    onSelectRow: state.handleSelectRow,
    onPinRow: state.handlePinRow,
    onCompareRow: state.handleCompareRow,
    onSearchFocus: state.handleSearchFocus,
    onCloseAll: state.handleCloseAll,
    isDrawerOpen: state.isDrawerOpen,
    isCompareModalOpen: state.isCompareModalOpen,
    isShortcutsModalOpen: state.isShortcutsModalOpen
  });

  return (
    <div className={`app-container ${state.theme} ${isMobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
      {isMobileSidebarOpen && (
        <div 
          className="sidebar-overlay-mobile"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
      
      <Sidebar 
        files={state.files}
        loadingFiles={state.loadingFiles}
        selectedFiles={state.selectedFiles}
        uploadedFiles={state.uploadedFiles}
        handleFileCheckboxToggle={state.handleFileCheckboxToggle}
        handleFileSelectOnly={state.handleFileSelectOnly}
        handleFileUpload={state.handleFileUpload}
        rules={state.rules}
        setRules={state.setRules}
        openRulesModal={state.openRulesModal}
        pinnedKeys={state.pinnedKeys}
        setPinnedKeys={state.setPinnedKeys}
        parsedLogs={state.parsedLogs}
        setActiveLog={state.setActiveLog}
        setIsDrawerOpen={state.setIsDrawerOpen}
        theme={state.theme}
        setTheme={state.setTheme}
        setFiles={state.setFiles}
        setLoadingFiles={state.setLoadingFiles}
        togglePin={state.togglePin}
        exportSession={state.exportSession}
        importSession={state.importSession}
      />

      <main className="main-content">
        {/* Floating Mobile Toggle Button */}
        <button 
          className="mobile-menu-toggle"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          title="Alternar menú lateral"
        >
          <span className="material-icons-round">
            {isMobileSidebarOpen ? 'close' : 'menu'}
          </span>
        </button>
        {/* Metric panels grid */}
        <section className="dashboard-grid">
          {KPI_CARDS.map((card, i) => (
            <div key={i} className={`kpi-card gradient-${card.cls}`}>
              <div className="card-icon">
                <span className="material-icons-round">{card.icon}</span>
              </div>
              <div className="card-info">
                <span className="card-label">{card.label}</span>
                <h2>{card.value}</h2>
                <span className="card-subtext">{card.sub}</span>
              </div>
            </div>
          ))}
        </section>

        {/* Level distribution graph */}
        {state.parsedLogs.length > 0 && state.activeTab === 'feed' && (
          <section className="distribution-section">
            <div className="distribution-header">
              <span>DISTRIBUCIÓN POR NIVELES</span>
              <div className="distribution-legend">
                {state.distribution.map(d => (
                  <div key={d.level} className="legend-item">
                    <div 
                      className="legend-color" 
                      style={{ backgroundColor: `hsl(${getLevelColor(d.level)})` }}
                    ></div>
                    <span>{d.level}: <b>{d.count}</b></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="distribution-bar">
              {state.distribution.length === 0 ? (
                <div className="empty-bar-msg">Sin datos para la selección actual</div>
              ) : (
                state.distribution.map(d => {
                  const pct = ((d.count / state.filteredLogs.length) * 100).toFixed(1);
                  return (
                    <div 
                      key={d.level} 
                      className="dist-segment" 
                      style={{ 
                        width: `${pct}%`, 
                        backgroundColor: `hsl(${getLevelColor(d.level)})` 
                      }} 
                      data-tooltip={`${d.level}: ${d.count} (${pct}%)`} 
                      onClick={() => { 
                        const s = new Set<LogLevel>(); 
                        s.add(d.level); 
                        state.setFilters(p => ({ ...p, activeLevels: s })); 
                        state.setCurrentPage(1); 
                      }} 
                    />
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Filters and Tab Navigation bar */}
        {state.parsedLogs.length > 0 && state.activeTab === 'feed' && (
          <FiltersPanel 
            filters={state.filters}
            setFilters={state.setFilters}
            setCurrentPage={state.setCurrentPage}
            uniqueServices={state.uniqueServices}
            handleLevelClick={state.handleLevelClick}
            setSortColumn={state.setSortColumn}
            setSortDirection={state.setSortDirection}
            logDateRange={state.logDateRange}
            applyTimePreset={state.applyTimePreset}
            applyFullDateRange={state.applyFullDateRange}
            filteredLogs={state.filteredLogs}
            setActiveLog={state.setActiveLog}
            setIsDrawerOpen={state.setIsDrawerOpen}
            availableLevels={state.availableLevels}
          />
        )}

        <section className="logs-feed-section">
          {/* Tab switches for Feed vs Metrics */}
          <div className="tab-container">
            <button 
              className={`tab-btn ${state.activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => state.setActiveTab('feed')}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>feed</span>
              Feed de Logs
            </button>
            <button 
              className={`tab-btn ${state.activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => state.setActiveTab('metrics')}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>insights</span>
              Salud y Analíticas QA
            </button>
            <button 
              className="rules-btn-trigger" 
              onClick={state.openRulesModal}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>rule</span>
              Reglas de Alerta QA
            </button>
            <button 
              className="rules-btn-trigger" 
              style={{ 
                background: 'rgba(97, 175, 239, 0.08)', 
                color: '#61afef', 
                border: '1px solid rgba(97, 175, 239, 0.2)' 
              }}
              onClick={() => state.setIsParserModalOpen(true)}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>tune</span>
              Estructura de Log (Parsers)
            </button>
            <button 
              className="rules-btn-trigger" 
              style={{ 
                background: 'rgba(229, 192, 123, 0.08)', 
                color: '#e5c07b', 
                border: '1px solid rgba(229, 192, 123, 0.2)' 
              }}
              onClick={() => state.setIsShortcutsModalOpen(true)}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>keyboard</span>
              Atajos
            </button>
          </div>

          {state.activeTab === 'feed' ? (
            <LogsTable 
              filteredLogs={state.filteredLogs}
              pageLogs={state.pageLogs}
              parsedLogs={state.parsedLogs}
              currentPage={state.currentPage}
              totalPages={state.totalPages}
              setCurrentPage={state.setCurrentPage}
              pageStart={state.pageStart}
              activeLog={state.activeLog}
              setActiveLog={state.setActiveLog}
              setIsDrawerOpen={state.setIsDrawerOpen}
              focusedIndex={state.focusedIndex}
              setFocusedIndex={state.setFocusedIndex}
              pinnedKeys={state.pinnedKeys}
              togglePin={state.togglePin}
              selectedFiles={state.selectedFiles}
              sortColumn={state.sortColumn}
              setSortColumn={state.setSortColumn}
              sortDirection={state.sortDirection}
              setSortDirection={state.setSortDirection}
              searchTerm={state.filters.searchTerm}
              isRegexSearch={state.filters.isRegexSearch}
              setFilters={state.setFilters}
              wrapLines={state.wrapLines}
              setWrapLines={state.setWrapLines}
            />
          ) : (
            <div className="feed-viewport" style={{ padding: '20px' }}>
              <AnalyticsDashboard 
                logs={state.filteredLogs}
                onSelectCorrelationId={(cid) => {
                  state.setFilters(p => ({ ...p, correlationId: cid }));
                  state.setActiveTab('feed');
                  state.setCurrentPage(1);
                }}
                onSelectService={(service) => {
                  state.setFilters(p => ({ ...p, activeService: service }));
                  state.setActiveTab('feed');
                  state.setCurrentPage(1);
                }}
              />
            </div>
          )}
        </section>
      </main>

      <DetailsDrawer 
        isDrawerOpen={state.isDrawerOpen}
        setIsDrawerOpen={state.setIsDrawerOpen}
        activeLog={state.activeLog}
        pinnedKeys={state.pinnedKeys}
        togglePin={state.togglePin}
        compareQueue={state.compareQueue}
        setCompareQueue={state.setCompareQueue}
        exportSuccess={state.exportSuccess}
        setExportSuccess={state.setExportSuccess}
        activeDiagnosis={state.activeDiagnosis}
        copyText={state.copyText}
        searchTerm={state.filters.searchTerm}
        isRegexSearch={state.filters.isRegexSearch}
        setFilters={state.setFilters}
        setCurrentPage={state.setCurrentPage}
      />

      <CompareModal 
        compareQueue={state.compareQueue}
        setCompareQueue={state.setCompareQueue}
        isCompareModalOpen={state.isCompareModalOpen}
        setIsCompareModalOpen={state.setIsCompareModalOpen}
      />

      <RulesModal 
        isRulesModalOpen={state.isRulesModalOpen}
        setIsRulesModalOpen={state.setIsRulesModalOpen}
        rulesJsonInput={state.rulesJsonInput}
        setRulesJsonInput={state.setRulesJsonInput}
        jsonError={state.jsonError}
        handleSaveRulesJson={state.handleSaveRulesJson}
        setRulesJsonInputToDefault={state.setRulesJsonInputToDefault}
      />

      <ParserModal 
        isOpen={state.isParserModalOpen}
        onClose={() => state.setIsParserModalOpen(false)}
        parsers={state.parsers}
        setParsers={state.setParsers}
      />

      <ShortcutsModal 
        isOpen={state.isShortcutsModalOpen}
        onClose={() => state.setIsShortcutsModalOpen(false)}
      />
    </div>
  );
}
