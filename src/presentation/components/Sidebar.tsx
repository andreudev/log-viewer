import React, { useCallback } from 'react';
import { LogFileMeta, fetchFiles } from '../../infrastructure/api/filesApi';
import { LogEntry } from '../../domain/models/LogEntry';
import { PromotionRule } from '../../domain/models/PromotionRule';
import { getFileColorStyle } from '../utils/helpers';
import { getLevelColor } from '../utils/constants';

interface SidebarProps {
  files: LogFileMeta[];
  loadingFiles: boolean;
  selectedFiles: string[];
  uploadedFiles: Record<string, string>;
  handleFileCheckboxToggle: (fileName: string) => void;
  handleFileSelectOnly: (fileName: string) => void;
  handleFileUpload: (file: File) => void;
  rules: PromotionRule[];
  setRules: React.Dispatch<React.SetStateAction<PromotionRule[]>>;
  openRulesModal: () => void;
  pinnedKeys: Set<string>;
  setPinnedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  parsedLogs: LogEntry[];
  setActiveLog: (log: LogEntry) => void;
  setIsDrawerOpen: (open: boolean) => void;
  theme: string;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
  setFiles: React.Dispatch<React.SetStateAction<LogFileMeta[]>>;
  setLoadingFiles: React.Dispatch<React.SetStateAction<boolean>>;
  togglePin: (log: LogEntry) => void;
  exportSession: () => void;
  importSession: (jsonData: any) => boolean;
  desktopAlertsEnabled: boolean;
  toggleDesktopAlerts: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  loadingFiles,
  selectedFiles,
  uploadedFiles,
  handleFileCheckboxToggle,
  handleFileSelectOnly,
  handleFileUpload,
  rules,
  setRules,
  openRulesModal,
  pinnedKeys,
  setPinnedKeys,
  parsedLogs,
  setActiveLog,
  setIsDrawerOpen,
  theme,
  setTheme,
  setFiles,
  setLoadingFiles,
  togglePin,
  exportSession,
  importSession,
  desktopAlertsEnabled,
  toggleDesktopAlerts
}) => {
  
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
      <div className="sidebar-header">
        <div className="logo-area">
          <span className="material-icons-round logo-icon">terminal</span>
          <div>
            <h1>LogScope</h1>
            <span className="sub-logo">Capa Media Analyzer</span>
          </div>
        </div>
      </div>
      
      <div className="sidebar-section">
        <div className="section-title">
          <span>ARCHIVOS LOCALES</span>
          <button className="icon-button" title="Refrescar" onClick={handleRefresh}>
            <span className="material-icons-round">refresh</span>
          </button>
        </div>
        <div className="files-list">
          {loadingFiles ? (
            <div className="zero-state">
              <div className="loader-spinner"></div>
              <p>Cargando archivos...</p>
            </div>
          ) : files.length === 0 && Object.keys(uploadedFiles).length === 0 ? (
            <div className="zero-state">
              <p>No se encontraron logs (.log/.txt) en la carpeta.</p>
            </div>
          ) : (() => {
              const allFiles = [...files];
              Object.keys(uploadedFiles).forEach(name => {
                if (!allFiles.some(f => f.name === name)) {
                  allFiles.push({
                    name,
                    sizeBytes: uploadedFiles[name].length,
                    modifiedAt: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                  });
                }
              });

              return allFiles.map(file => {
                const isChecked = selectedFiles.includes(file.name);
                return (
                  <div 
                    key={file.name} 
                    className={`file-item-row ${isChecked ? 'active' : ''}`}
                  >
                    <label className="file-checkbox-label" title="Seleccionar para combinar">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={() => handleFileCheckboxToggle(file.name)} 
                      />
                    </label>
                    <button 
                      className="file-item-btn" 
                      onClick={() => handleFileSelectOnly(file.name)}
                      title="Ver solo este archivo"
                    >
                      <span className="material-icons-round file-icon">insert_drive_file</span>
                      <div className="file-details">
                        <span className="file-name" title={file.name}>{file.name}</span>
                        <div className="file-meta">
                          <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              });
            })()
          }
        </div>
      </div>
      
      <div className="sidebar-section drag-drop-section">
        <div className="section-title"><span>ANALIZAR OTROS ARCHIVOS</span></div>
        <div 
          className="drop-zone" 
          onClick={() => document.getElementById('file-input')?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('hover'); }}
          onDragLeave={e => e.currentTarget.classList.remove('hover')}
          onDrop={e => { 
            e.preventDefault(); 
            e.currentTarget.classList.remove('hover'); 
            if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]); 
          }}
        >
          <span className="material-icons-round drop-icon">cloud_upload</span>
          <p>Suelte archivos .log o .txt aquí</p>
          <span className="drop-subtext">o haz clic para explorar</span>
          <input 
            type="file" 
            id="file-input" 
            accept=".log,.txt" 
            style={{ display: 'none' }} 
            onChange={e => { if (e.target.files?.length) handleFileUpload(e.target.files[0]); }} 
          />
        </div>
      </div>

      {/* QA Test Sessions */}
      <div className="sidebar-section session-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-title">
          <span>SESIONES DE PRUEBA QA</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button 
            className="action-btn-accent" 
            onClick={exportSession}
            style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '6px', 
              padding: '8px', 
              fontSize: '11px',
              borderRadius: '6px',
              background: 'var(--btn-gradient)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
              boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
            }}
            title="Exportar la sesión de pruebas actual"
          >
            <span className="material-icons-round" style={{ fontSize: '14px' }}>download</span>
            Exportar
          </button>
          
          <button 
            className="action-btn-secondary" 
            onClick={() => document.getElementById('session-file-input')?.click()}
            style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '6px', 
              padding: '8px', 
              fontSize: '11px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'background 0.2s'
            }}
            title="Importar sesión de pruebas guardada"
          >
            <span className="material-icons-round" style={{ fontSize: '14px' }}>upload_file</span>
            Importar
          </button>
          <input 
            type="file" 
            id="session-file-input" 
            accept=".json" 
            style={{ display: 'none' }} 
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                  try {
                    const parsed = JSON.parse(evt.target?.result as string);
                    const success = importSession(parsed);
                    if (success) {
                      alert("Sesión QA restaurada con éxito.");
                    } else {
                      alert("Error al restaurar el archivo de sesión.");
                    }
                  } catch (err) {
                    alert("Archivo JSON no válido.");
                  }
                };
                reader.readAsText(file);
              }
            }} 
          />
        </div>
      </div>

      {/* Desktop Alerts Section */}
      <div className="sidebar-section" style={{ flex: '0 0 auto', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-title">
          <span>NOTIFICACIONES ESCRITORIO</span>
        </div>
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.15)',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            marginTop: '8px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Alertas en Inactividad
            </span>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', lineHeight: '1.2' }}>
              Notificar ERROR/WARN en segundo plano
            </span>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={desktopAlertsEnabled} 
              onChange={toggleDesktopAlerts} 
            />
            <span className="slider"></span>
          </label>
        </div>
      </div>

      {/* Sidebar Rules Section */}
      <div className="sidebar-section" style={{ flex: '0 0 auto', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div className="section-title">
          <span>REGLAS DE ALERTA QA</span>
          <button className="icon-button" title="Editar JSON" onClick={openRulesModal}>
            <span className="material-icons-round">edit</span>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {rules.map(rule => (
            <div 
              key={rule.id}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.15)',
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={rule.pattern}>
                  {rule.pattern}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  Elevar a {rule.targetLevel}
                </span>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={rule.enabled} 
                  onChange={() => {
                    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                  }} 
                />
                <span className="slider"></span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Persisted & Unified Pinned list */}
      {pinnedKeys.size > 0 && (
        <div className="sidebar-section pinned-section">
          <div className="section-title">
            <span>LOGS FIJADOS ({pinnedKeys.size})</span>
            <button 
              className="icon-button compact-btn" 
              title="Limpiar todos los pines"
              onClick={() => {
                setPinnedKeys(new Set());
                localStorage.removeItem('pinnedKeys');
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 14 }}>delete_sweep</span>
            </button>
          </div>
          <div className="pinned-list">
            {Array.from(pinnedKeys).map(key => {
              const [originFile, originalIdStr] = key.split('::');
              const originalId = parseInt(originalIdStr, 10);
              const log = parsedLogs.find(l => l.originFile === originFile && l.originalId === originalId);
              if (!log) {
                return (
                  <div key={key} className="pinned-item" style={{ opacity: 0.5 }}>
                    <div className="pinned-item-header">
                      <span className="pinned-badge" style={{ color: 'var(--text-muted)' }}>INACTIVO</span>
                      <button 
                        className="pinned-remove-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedKeys(prev => {
                            const next = new Set(prev);
                            next.delete(key);
                            localStorage.setItem('pinnedKeys', JSON.stringify(Array.from(next)));
                            return next;
                          });
                        }}
                      >
                        <span className="material-icons-round">close</span>
                      </button>
                    </div>
                    <div className="pinned-msg" title={`Archivo: ${originFile}`}>{originFile} (No seleccionado)</div>
                  </div>
                );
              }

              const lc = getLevelColor(log.level || 'INFO');
              const timestamp = log.timestamp || '';
              const time = timestamp.includes(' ') ? timestamp.split(' ')[1] : timestamp || '-';
              const logMsg = log.message || '';
              const shortMsg = logMsg.trim().slice(0, 45) + (logMsg.length > 45 ? '...' : '');
              return (
                <div 
                  key={key} 
                  className={`pinned-item level-${(log.level || 'info').toLowerCase()}`}
                  onClick={() => {
                    setActiveLog(log);
                    setIsDrawerOpen(true);
                    setTimeout(() => {
                      const row = document.getElementById(`log-row-${log.id}`);
                      if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }}
                >
                  <div className="pinned-item-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                      {log.originFile && (
                        <span className="pinned-badge" style={{ fontSize: '8px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50px' }} title={log.originFile}>
                          {log.originFile}
                        </span>
                      )}
                      <span className="pinned-badge" style={{ color: `hsl(${lc})`, background: `hsla(${lc},0.1)` }}>{log.level}</span>
                    </div>
                    <span className="pinned-time">{time}</span>
                    <button 
                      className="pinned-remove-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(log);
                      }}
                    >
                      <span className="material-icons-round">close</span>
                    </button>
                  </div>
                  <div className="pinned-msg" title={log.message}>{shortMsg}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="sidebar-footer" style={{ gap: '10px', padding: '12px 16px' }}>
        <div className="theme-select-container" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            <span className="material-icons-round" style={{ fontSize: '12px' }}>palette</span>
            <span>TEMA VISUAL PRO</span>
          </div>
          <select 
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
              transition: 'border-color 0.2s'
            }}
          >
            <option value="dark-theme">One Dark Pro (Default)</option>
            <option value="light-theme">One Light Pro</option>
            <option value="dracula-theme">Dracula Vampire</option>
            <option value="nord-theme">Nordic Frost</option>
            <option value="cyberpunk-theme">Cyberpunk Neon</option>
            <option value="glass-theme">Glassmorphism (Crystal)</option>
          </select>
        </div>
        <div className="system-stats" style={{ marginTop: '4px' }}>
          <span className="system-status active"></span>
          <span>Watcher en Vivo Sincronizado</span>
        </div>
      </div>
    </aside>
  );
};
