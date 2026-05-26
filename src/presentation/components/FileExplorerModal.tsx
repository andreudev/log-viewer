import React from 'react';
import { LogFileMeta } from '../../infrastructure/api/filesApi';

interface FileExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: LogFileMeta[];
  loadingFiles: boolean;
  selectedFiles: string[];
  uploadedFiles: Record<string, string>;
  handleFileCheckboxToggle: (fileKey: string) => void;
  handleFileSelectOnly: (fileKey: string) => void;
  handleFileUpload: (file: File) => void;
  handleRefresh: () => void;
}

export const FileExplorerModal: React.FC<FileExplorerModalProps> = ({
  isOpen,
  onClose,
  files,
  loadingFiles,
  selectedFiles,
  uploadedFiles,
  handleFileCheckboxToggle,
  handleFileSelectOnly,
  handleFileUpload,
  handleRefresh
}) => {
  if (!isOpen) return null;

  const allFiles = [...files];
  Object.keys(uploadedFiles).forEach(name => {
    if (!allFiles.some(f => f.name === name)) {
      allFiles.push({
        name,
        sizeBytes: uploadedFiles[name].length,
        modifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        origin: 'local',
        originName: 'Local'
      });
    }
  });

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 260 }} onClick={onClose}>
      <div 
        className="compare-modal" 
        style={{ 
          maxWidth: '850px', 
          maxHeight: '680px', 
          height: '85vh',
          width: '90vw'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round" style={{ color: 'var(--accent-solid)' }}>folder</span>
            <h2>Explorador de Archivos (Local y Remoto)</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              className="icon-button" 
              title="Refrescar" 
              onClick={handleRefresh}
              style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
            >
              <span className="material-icons-round">refresh</span>
            </button>
            <button className="icon-button" onClick={onClose} title="Cerrar Explorador">
              <span className="material-icons-round">close</span>
            </button>
          </div>
        </div>

        {/* Modal Meta Bar */}
        <div className="compare-modal-meta" style={{ display: 'block', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Selecciona múltiples archivos con las casillas de verificación para <b>combinar y ordenar sus logs cronológicamente</b>, o haz clic directamente en un archivo para visualizarlo de manera exclusiva.
          </p>
        </div>

        {/* Modal Body */}
        <div 
          style={{ 
            display: 'flex', 
            flex: 1, 
            overflow: 'hidden', 
            background: 'var(--bg-panel)',
            flexDirection: 'row'
          }}
        >
          {/* Files List Panel (Left) */}
          <div 
            style={{ 
              flex: 1.2, 
              borderRight: '1px solid var(--border-color)',
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            {loadingFiles ? (
              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '250px',
                  color: 'var(--text-secondary)'
                }}
              >
                <div className="loader-spinner" style={{ marginBottom: '12px' }}></div>
                <span style={{ fontSize: '13px' }}>Buscando archivos en servidores...</span>
              </div>
            ) : allFiles.length === 0 ? (
              <div 
                style={{ 
                  padding: '40px 20px', 
                  textAlign: 'center', 
                  color: 'var(--text-muted)',
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '40px', opacity: 0.4, marginBottom: '8px' }}>insert_drive_file</span>
                <p style={{ margin: 0, fontSize: '13px' }}>No se encontraron archivos en el directorio local ni en los servidores SSH.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px 6px 8px', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)' }}>ARCHIVO DE LOG</span>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)' }}>TAMAÑO / ORIGEN</span>
                </div>
                {allFiles.map(file => {
                  const fileKey = `${file.origin || 'local'}::${file.name}`;
                  const isChecked = selectedFiles.includes(fileKey);
                  return (
                    <div 
                      key={fileKey} 
                      className={`file-item-row ${isChecked ? 'active' : ''}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        background: isChecked ? 'var(--accent-bg)' : 'rgba(255,255,255,0.01)',
                        border: '1px solid ' + (isChecked ? 'var(--accent-solid)' : 'var(--border-color)'),
                        borderRadius: '6px',
                        padding: '6px 10px',
                        gap: '10px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <label 
                        className="file-checkbox-label" 
                        title="Seleccionar para combinar"
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => handleFileCheckboxToggle(fileKey)}
                        />
                      </label>
                      <button 
                        className="file-item-btn" 
                        onClick={() => {
                          handleFileSelectOnly(fileKey);
                          onClose();
                        }}
                        title="Ver solo este archivo"
                        style={{
                          flex: 1,
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '4px 0',
                          minWidth: 0
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '20px', color: isChecked ? 'var(--accent-solid)' : 'var(--text-secondary)' }}>
                          insert_drive_file
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: isChecked ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }} title={file.name}>
                            {file.name}
                          </span>
                          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Modificado: {new Date(file.modifiedAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {(file.sizeBytes / 1024).toFixed(1)} KB
                          </span>
                          {file.originName && (
                            <span style={{ 
                              background: file.origin === 'local' ? 'rgba(255,255,255,0.06)' : 'var(--accent-bg)', 
                              color: file.origin === 'local' ? 'var(--text-muted)' : 'var(--accent-solid)', 
                              fontSize: '8px', 
                              padding: '1px 5px', 
                              borderRadius: '3px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {file.originName}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload panel & info (Right) */}
          <div 
            style={{ 
              flex: 0.8, 
              padding: '24px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px', 
              background: 'rgba(0,0,0,0.1)' 
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>Subir Archivo Log Ad-Hoc</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                ¿Tienes un archivo local de logs que no está en la carpeta del servidor? Arrástralo aquí para procesarlo directamente en el navegador.
              </p>
            </div>

            <div 
              className="drop-zone" 
              onClick={() => document.getElementById('modal-file-input')?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('hover'); }}
              onDragLeave={e => e.currentTarget.classList.remove('hover')}
              onDrop={e => { 
                e.preventDefault(); 
                e.currentTarget.classList.remove('hover'); 
                if (e.dataTransfer.files.length > 0) {
                  handleFileUpload(e.dataTransfer.files[0]);
                  onClose();
                }
              }}
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: '8px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s ease-out'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--accent-solid)', marginBottom: '8px' }}>cloud_upload</span>
              <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Arrastre logs aquí</p>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>o haga clic para explorar archivos</span>
              <input 
                type="file" 
                id="modal-file-input" 
                accept=".log,.txt" 
                style={{ display: 'none' }} 
                onChange={e => { 
                  if (e.target.files?.length) {
                    handleFileUpload(e.target.files[0]); 
                    onClose();
                  }
                }} 
              />
            </div>

            <div style={{ background: 'rgba(97, 175, 239, 0.05)', border: '1px solid rgba(97, 175, 239, 0.15)', padding: '12px 14px', borderRadius: '6px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#61afef', fontWeight: 600, marginBottom: '6px' }}>
                <span className="material-icons-round" style={{ fontSize: '16px' }}>info</span>
                <span>Configuración de Servidores</span>
              </div>
              <span>
                Puedes dar de alta más balanceadores y nodos en la pestaña de <b>Servidores SSH</b> en el panel de Ajustes para que sus archivos aparezcan automáticamente en la lista de la izquierda.
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid var(--border-color)', gap: '10px', background: 'var(--bg-panel-hover)' }}>
          <button className="secondary-button" onClick={onClose} style={{ padding: '8px 16px' }}>
            Cerrar
          </button>
          <button 
            className="primary-button" 
            onClick={onClose}
            style={{ padding: '8px 20px' }}
          >
            Aplicar Selección ({selectedFiles.length})
          </button>
        </div>
      </div>
    </div>
  );
};
