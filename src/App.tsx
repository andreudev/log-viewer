import { useState } from 'react';
import { useLogViewerState } from './presentation/hooks/useLogViewerState';
import { useKeyboardShortcuts } from './presentation/hooks/useKeyboardShortcuts';
import { Sidebar } from './presentation/components/Sidebar';
import { FiltersPanel } from './presentation/components/FiltersPanel';
import { LogsTable } from './presentation/components/LogsTable';
import { BottomDetailPanel } from './presentation/components/BottomDetailPanel';
import { CompareModal } from './presentation/components/CompareModal';
import { RulesModal } from './presentation/components/RulesModal';
import { ShortcutsModal } from './presentation/components/ShortcutsModal';
import { AnalyticsDashboard } from './presentation/components/AnalyticsDashboard';
import { ParserModal } from './presentation/components/ParserModal';
import { ErrorBoundary } from './presentation/components/ErrorBoundary';
import { ProcessingOverlay } from './presentation/components/ProcessingOverlay';
import { SettingsModal } from './presentation/components/SettingsModal';
import { SessionDiffModal } from './presentation/components/SessionDiffModal';

export function App() {
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(320);
  // Display mode (parsed table vs raw text) is shared across all panes so
  // toggling it once in one pane keeps both panes in sync and survives
  // file changes, split mode toggles, etc.
  const [displayMode, setDisplayMode] = useState<'parsed' | 'raw'>('parsed');

  const leftState = useLogViewerState('left');
  const rightState = useLogViewerState('right');

  const state = activePane === 'left' ? leftState : rightState;
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSessionDiffOpen, setIsSessionDiffOpen] = useState(false);

  // Dashboard de salud eliminado: el foco es ver logs en vivo, no contar
  // cuantos hay. buildStats/distribution en useLogViewerState siguen
  // disponibles por si se quiere mostrar en otro lado (ej: una vista de
  // analytics separada), pero no se renderizan aqui.

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
      {/* Toast global: archivos no encontrados, etc. */}
      {state.missingFilesToast && (
        <div
          className="global-toast global-toast-error"
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            background: 'rgba(224, 108, 117, 0.95)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            maxWidth: '480px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '20px' }}>
            error_outline
          </span>
          <span style={{ flex: 1 }}>{state.missingFilesToast}</span>
          <button
            type="button"
            onClick={() => state.setMissingFilesToast(null)}
            aria-label="Cerrar notificacion"
            title="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
          </button>
        </div>
      )}
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
        pinnedKeys={state.pinnedKeys}
        setPinnedKeys={state.setPinnedKeys}
        parsedLogs={state.parsedLogs}
        setActiveLog={state.setActiveLog}
        setIsDrawerOpen={state.setIsDrawerOpen}
        setFiles={state.setFiles}
        setLoadingFiles={state.setLoadingFiles}
        togglePin={state.togglePin}
        // Split Mode
        isSplitMode={isSplitMode}
        activePane={activePane}
        setActivePane={setActivePane}
        // Open Settings Modal
        openSettingsModal={() => setIsSettingsModalOpen(true)}
        setFilters={state.setFilters}
        setCurrentPage={state.setCurrentPage}
        annotations={state.annotations}
        setAnnotations={state.setAnnotations}
        openSessionDiff={() => setIsSessionDiffOpen(true)}
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

        {/* Filters and Tab Navigation bar */}
        {state.parsedLogs.length > 0 && state.activeTab === 'feed' && (
          <ErrorBoundary fallbackTitle="Error en el panel de filtros">
            <FiltersPanel
              filters={state.filters}
              setFilters={state.setFilters}
              resetFilters={state.resetFilters}
              setCurrentPage={state.setCurrentPage}
              uniqueServices={state.uniqueServices}
              setSortColumn={state.setSortColumn}
              setSortDirection={state.setSortDirection}
              logDateRange={state.logDateRange}
              applyTimePreset={state.applyTimePreset}
              applyFullDateRange={state.applyFullDateRange}

              isTailing={state.isTailing}
              setIsTailing={state.setIsTailing}
              isTailPaused={state.isTailPaused}
              setIsTailPaused={state.setIsTailPaused}
              autoScrollTail={state.autoScrollTail}
              setAutoScrollTail={state.setAutoScrollTail}
              selectedFiles={state.selectedFiles}
              tailBufferLimit={state.tailBufferLimit}
              setTailBufferLimit={state.setTailBufferLimit}
              pausedLogsCount={state.pausedLogs.length}
              tailStatus={state.tailStatus}
              tailStatusTick={state.tailStatusTick}
            />
          </ErrorBoundary>
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
            <ErrorBoundary fallbackTitle="Error en el feed de logs">
              <div className={isSplitMode ? "split-feed-container" : "single-feed-container"}>
                <div 
                  className={`pane-container left-pane ${isSplitMode && activePane === 'left' ? 'pane-active' : ''}`}
                  onClick={() => isSplitMode && setActivePane('left')}
                >
                  {isSplitMode && (
                    <div className="pane-header-indicator">
                      <span className="material-icons-round">view_sidebar</span> Panel Izquierdo {activePane === 'left' && "(Activo)"}
                    </div>
                  )}
                  <LogsTable
                    filteredLogs={leftState.filteredLogs}
                    pageLogs={leftState.pageLogs}
                    parsedLogs={leftState.parsedLogs}
                    currentPage={leftState.currentPage}
                    totalPages={leftState.totalPages}
                    setCurrentPage={leftState.setCurrentPage}
                    pageStart={leftState.pageStart}
                    activeLog={leftState.activeLog}
                    setActiveLog={leftState.setActiveLog}
                    setIsDrawerOpen={leftState.setIsDrawerOpen}
                    focusedIndex={leftState.focusedIndex}
                    setFocusedIndex={leftState.setFocusedIndex}
                    pinnedKeys={leftState.pinnedKeys}
                    togglePin={leftState.togglePin}
                    selectedFiles={leftState.selectedFiles}
                    sortColumn={leftState.sortColumn}
                    setSortColumn={leftState.setSortColumn}
                    sortDirection={leftState.sortDirection}
                    setSortDirection={leftState.setSortDirection}
                    searchTerm={leftState.filters.searchTerm}
                    isRegexSearch={leftState.filters.isRegexSearch}
                    setFilters={leftState.setFilters}
                    wrapLines={leftState.wrapLines}
                    setWrapLines={leftState.setWrapLines}
                    viewMode={leftState.viewMode}
                    setViewMode={leftState.setViewMode}
                    saveAnnotation={leftState.saveAnnotation}
                    isTailing={leftState.isTailing}
                    autoScrollTail={leftState.autoScrollTail}
                    downloadFilteredLogs={leftState.downloadFilteredLogs}
                    isSplitMode={isSplitMode}
                    setIsSplitMode={setIsSplitMode}
                    displayMode={displayMode}
                    setDisplayMode={setDisplayMode}
                  />
                </div>

                {isSplitMode && (
                  <div 
                    className={`pane-container right-pane ${activePane === 'right' ? 'pane-active' : ''}`}
                    onClick={() => setActivePane('right')}
                  >
                    <div className="pane-header-indicator">
                      <span className="material-icons-round">view_sidebar</span> Panel Derecho {activePane === 'right' && "(Activo)"}
                    </div>
                    <LogsTable
                      filteredLogs={rightState.filteredLogs}
                      pageLogs={rightState.pageLogs}
                      parsedLogs={rightState.parsedLogs}
                      currentPage={rightState.currentPage}
                      totalPages={rightState.totalPages}
                      setCurrentPage={rightState.setCurrentPage}
                      pageStart={rightState.pageStart}
                      activeLog={rightState.activeLog}
                      setActiveLog={rightState.setActiveLog}
                      setIsDrawerOpen={rightState.setIsDrawerOpen}
                      focusedIndex={rightState.focusedIndex}
                      setFocusedIndex={rightState.setFocusedIndex}
                      pinnedKeys={rightState.pinnedKeys}
                      togglePin={rightState.togglePin}
                      selectedFiles={rightState.selectedFiles}
                      sortColumn={rightState.sortColumn}
                      setSortColumn={rightState.setSortColumn}
                      sortDirection={rightState.sortDirection}
                      setSortDirection={rightState.setSortDirection}
                      searchTerm={rightState.filters.searchTerm}
                      isRegexSearch={rightState.filters.isRegexSearch}
                      setFilters={rightState.setFilters}
                      wrapLines={rightState.wrapLines}
                      setWrapLines={rightState.setWrapLines}
                      viewMode={rightState.viewMode}
                      setViewMode={rightState.setViewMode}
                      saveAnnotation={rightState.saveAnnotation}
                      isTailing={rightState.isTailing}
                      autoScrollTail={rightState.autoScrollTail}
                      downloadFilteredLogs={rightState.downloadFilteredLogs}
                      isSplitMode={isSplitMode}
                      setIsSplitMode={setIsSplitMode}
                      displayMode={displayMode}
                      setDisplayMode={setDisplayMode}
                    />
                  </div>
                )}
              </div>
            </ErrorBoundary>
          ) : (
            <div className="feed-viewport" style={{ padding: '20px' }}>
              <ErrorBoundary fallbackTitle="Error en las analíticas">
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
                setFilters={state.setFilters}
                setCurrentPage={state.setCurrentPage}
              />
              </ErrorBoundary>
            </div>
          )}

          <ErrorBoundary fallbackTitle="Error en el panel de detalles">
            <BottomDetailPanel
              isOpen={state.isDrawerOpen}
              setIsOpen={state.setIsDrawerOpen}
              activeLog={state.activeLog}
              height={bottomPanelHeight}
              onResize={setBottomPanelHeight}
            />
          </ErrorBoundary>
        </section>
      </main>

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

      <SessionDiffModal
        isOpen={isSessionDiffOpen}
        onClose={() => setIsSessionDiffOpen(false)}
        isSplitMode={isSplitMode}
        setIsSplitMode={setIsSplitMode}
        leftState={leftState}
        rightState={rightState}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        theme={state.theme}
        setTheme={state.setTheme}
        exportSession={state.exportSession}
        importSession={state.importSession}
        desktopAlertsEnabled={state.desktopAlertsEnabled}
        toggleDesktopAlerts={state.toggleDesktopAlerts}
        webhookUrl={state.webhookUrl}
        setWebhookUrl={state.setWebhookUrl}
        webhookType={state.webhookType}
        setWebhookType={state.setWebhookType}
        webhookEnabled={state.webhookEnabled}
        setWebhookEnabled={state.setWebhookEnabled}
        sendTestWebhook={state.sendTestWebhook}
        sshConnections={state.sshConnections}
        sshLoading={state.sshLoading}
        sshError={state.sshError}
        saveSshConnection={state.saveSshConnection}
        deleteSshConnection={state.deleteSshConnection}
        testSshConnectionConfig={state.testSshConnectionConfig}
        rules={state.rules}
        setRules={state.setRules}
        openRulesModal={state.openRulesModal}
        localLogsDir={state.localLogsDir}
        saveLocalLogsDir={state.saveLocalLogsDir}
        systemSettings={state.systemSettings}
        updateSystemSettings={state.updateSystemSettings}
      />

      <ProcessingOverlay 
        isProcessing={state.isProcessing} 
        progress={state.progress} 
        statusText={state.statusText} 
      />
    </div>
  );
}
