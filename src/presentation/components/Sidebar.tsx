import React, { useCallback, useState } from 'react';
import { LogFileMeta, fetchFiles } from '../../infrastructure/api/filesApi';
import { LogEntry } from '../../domain/models/LogEntry';
import { FileExplorerModal } from './FileExplorerModal';
import { GlobalSearchModal } from './GlobalSearchModal';
import { PinnedLogsModal } from './PinnedLogsModal';
import { NotesManagerModal } from './NotesManagerModal';
import { AnnotationDetail } from '../hooks/useLogViewerState';

interface SidebarProps {
  files: LogFileMeta[];
  loadingFiles: boolean;
  selectedFiles: string[];
  uploadedFiles: Record<string, string>;
  handleFileCheckboxToggle: (fileName: string) => void;
  handleFileSelectOnly: (fileName: string) => void;
  handleFileUpload: (file: File) => void;
  pinnedKeys: Set<string>;
  setPinnedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  parsedLogs: LogEntry[];
  setActiveLog: (log: LogEntry) => void;
  setIsDrawerOpen: (open: boolean) => void;
  setFiles: React.Dispatch<React.SetStateAction<LogFileMeta[]>>;
  setLoadingFiles: React.Dispatch<React.SetStateAction<boolean>>;
  togglePin: (log: LogEntry) => void;
  // Split pane
  isSplitMode?: boolean;
  activePane?: 'left' | 'right';
  setActivePane?: (pane: 'left' | 'right') => void;
  // Settings modal
  openSettingsModal: () => void;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  annotations: Record<string, string | AnnotationDetail>;
  setAnnotations: React.Dispatch<React.SetStateAction<Record<string, string | AnnotationDetail>>>;
  openSessionDiff?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  loadingFiles,
  selectedFiles,
  uploadedFiles,
  handleFileCheckboxToggle,
  handleFileSelectOnly,
  handleFileUpload,
  pinnedKeys,
  setPinnedKeys,
  parsedLogs,
  setActiveLog,
  setIsDrawerOpen,
  setFiles,
  setLoadingFiles,
  togglePin,
  isSplitMode = false,
  activePane = 'left',
  setActivePane,
  openSettingsModal,
  setFilters,
  setCurrentPage,
  annotations,
  setAnnotations,
  openSessionDiff
}) => {
  // Modal visibility states
  const [isFileExplorerOpen, setIsFileExplorerOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isPinnedLogsOpen, setIsPinnedLogsOpen] = useState(false);
  const [isNotesManagerOpen, setIsNotesManagerOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    setLoadingFiles(true);
    fetchFiles().then(f => {
      setFiles(f);
      setLoadingFiles(false);
    }).catch(err => {
      console.error("Error refreshing files:", err);
      setLoadingFiles(false);
    });
  }, [setFiles, setLoadingFiles]);

  return (
    <aside className="sidebar">
      {/* Split Mode Pane Switcher */}
      {isSplitMode && (
        <div style={{ 
          display: 'flex', 
          gap: '4px', 
          padding: '8px 12px', 
          background: 'rgba(0,0,0,0.18)', 
          borderBottom: '1px solid var(--border-color)', 
          width: '100%',
          flexShrink: 0
        }}>
          <button 
            onClick={() => setActivePane && setActivePane('left')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid ' + (activePane === 'left' ? 'var(--accent-solid)' : 'var(--border-color)'),
              background: activePane === 'left' ? 'var(--accent-bg)' : 'transparent',
              color: activePane === 'left' ? 'var(--accent-solid)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Pane Izquierdo
          </button>
          <button 
            onClick={() => setActivePane && setActivePane('right')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid ' + (activePane === 'right' ? 'var(--accent-solid)' : 'var(--border-color)'),
              background: activePane === 'right' ? 'var(--accent-bg)' : 'transparent',
              color: activePane === 'right' ? 'var(--accent-solid)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Pane Derecho
          </button>
        </div>
      )}

      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="logo-area">
          <span className="material-icons-round logo-icon">terminal</span>
          <div>
            <h1>LogScope</h1>
            <span className="sub-logo">Capa Media Analyzer</span>
          </div>
        </div>
      </div>

      {/* Menu / Navigation list */}
      <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, paddingLeft: '8px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Menú de Análisis
        </span>

        {/* 1. File Explorer Button */}
        <button
          onClick={() => setIsFileExplorerOpen(true)}
          className={`sidebar-menu-item ${isFileExplorerOpen ? 'active' : ''}`}
          style={{ position: 'relative' }}
        >
          <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--accent-solid)' }}>folder_open</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Explorador de Archivos</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Seleccionar y combinar logs</span>
          </div>
          {selectedFiles.length > 0 && (
            <span style={{ 
              background: 'var(--accent-solid)', 
              color: '#fff', 
              fontSize: '10px', 
              fontWeight: 'bold', 
              borderRadius: '10px', 
              minWidth: '18px', 
              height: '18px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '0 4px'
            }}>
              {selectedFiles.length}
            </span>
          )}
        </button>

        {/* 2. Global Search Button */}
        <button
          onClick={() => setIsGlobalSearchOpen(true)}
          className={`sidebar-menu-item ${isGlobalSearchOpen ? 'active' : ''}`}
        >
          <span className="material-icons-round" style={{ fontSize: '20px', color: '#61afef' }}>travel_explore</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Búsqueda Global</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Escanear todos los archivos</span>
          </div>
        </button>

        {/* 3. Pinned Logs Button */}
        <button
          onClick={() => setIsPinnedLogsOpen(true)}
          className={`sidebar-menu-item ${isPinnedLogsOpen ? 'active' : ''}`}
        >
          <span className="material-icons-round" style={{ fontSize: '20px', color: '#e5c07b' }}>push_pin</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Logs Fijados</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Registros favoritos</span>
          </div>
          {pinnedKeys.size > 0 && (
            <span style={{ 
              background: '#e5c07b', 
              color: '#282c34', 
              fontSize: '10px', 
              fontWeight: 'bold', 
              borderRadius: '10px', 
              minWidth: '18px', 
              height: '18px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '0 4px'
            }}>
              {pinnedKeys.size}
            </span>
          )}
        </button>

        {/* 3.5 Analyst Notes Button */}
        <button
          onClick={() => setIsNotesManagerOpen(true)}
          className={`sidebar-menu-item ${isNotesManagerOpen ? 'active' : ''}`}
        >
          <span className="material-icons-round" style={{ fontSize: '20px', color: '#e5c07b' }}>note_alt</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Gestor de Notas</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Reportes masivos de observaciones</span>
          </div>
          {Object.keys(annotations).length > 0 && (
            <span style={{ 
              background: '#e5c07b', 
              color: '#282c34', 
              fontSize: '10px', 
              fontWeight: 'bold', 
              borderRadius: '10px', 
              minWidth: '18px', 
              height: '18px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '0 4px'
            }}>
              {Object.keys(annotations).length}
            </span>
          )}
        </button>

        {/* 3.6 Session Diff Button */}
        <button
          onClick={openSessionDiff}
          className="sidebar-menu-item"
        >
          <span className="material-icons-round" style={{ fontSize: '20px', color: '#c678dd' }}>difference</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Comparar Sesiones (Diff)</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Diferencias de logs izquierdo y derecho</span>
          </div>
        </button>

        {/* 4. Settings Button */}
        <button
          onClick={openSettingsModal}
          className="sidebar-menu-item"
        >
          <span className="material-icons-round" style={{ fontSize: '20px', color: '#98c379' }}>settings</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Ajustes del Sistema</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>SSH y carpeta de logs</span>
          </div>
        </button>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer" style={{ gap: '10px', padding: '12px 16px' }}>
        <div className="system-stats" style={{ marginTop: '4px' }}>
          <span className="system-status active"></span>
          <span>Watcher en Vivo Sincronizado</span>
        </div>
      </div>

      {/* MODALS INTEGRATION */}
      <FileExplorerModal
        isOpen={isFileExplorerOpen}
        onClose={() => setIsFileExplorerOpen(false)}
        files={files}
        loadingFiles={loadingFiles}
        selectedFiles={selectedFiles}
        uploadedFiles={uploadedFiles}
        handleFileCheckboxToggle={handleFileCheckboxToggle}
        handleFileSelectOnly={handleFileSelectOnly}
        handleFileUpload={handleFileUpload}
        handleRefresh={handleRefresh}
      />

      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        handleFileSelectOnly={handleFileSelectOnly}
        setFilters={setFilters}
        setCurrentPage={setCurrentPage}
      />

      <PinnedLogsModal
        isOpen={isPinnedLogsOpen}
        onClose={() => setIsPinnedLogsOpen(false)}
        pinnedKeys={pinnedKeys}
        setPinnedKeys={setPinnedKeys}
        parsedLogs={parsedLogs}
        setActiveLog={setActiveLog}
        setIsDrawerOpen={setIsDrawerOpen}
        togglePin={togglePin}
      />

      <NotesManagerModal
        isOpen={isNotesManagerOpen}
        onClose={() => setIsNotesManagerOpen(false)}
        annotations={annotations}
        setAnnotations={setAnnotations}
        parsedLogs={parsedLogs}
        setActiveLog={setActiveLog}
        setIsDrawerOpen={setIsDrawerOpen}
      />
    </aside>
  );
};
