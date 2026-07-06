import React, { useState } from 'react';
import { executeGlobalSearch, GlobalSearchResult } from '../../infrastructure/api/filesApi';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleFileSelectOnly: (fileKey: string) => void;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  handleFileSelectOnly,
  setFilters,
  setCurrentPage
}) => {
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await executeGlobalSearch(query, isRegex);
      setResults(data);
      if (data.length === 0) {
        setError('No se encontraron coincidencias en los archivos analizados.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al ejecutar la búsqueda cruzada.');
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (result: GlobalSearchResult) => {
    // Switch active file
    handleFileSelectOnly(result.fileKey);
    // Apply search filter and go to page 1
    setFilters((f: any) => ({
      ...f,
      searchTerm: query,
      isRegexSearch: isRegex
    }));
    setCurrentPage(1);
    onClose();
  };

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 260 }} onClick={onClose}>
      <div 
        className="compare-modal" 
        style={{ 
          maxWidth: '750px', 
          maxHeight: '650px', 
          height: '80vh',
          width: '90vw'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round" style={{ color: 'var(--accent-solid)' }}>travel_explore</span>
            <h2>Búsqueda Global Cruzada</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Cerrar Búsqueda">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Modal Meta Bar */}
        <div className="compare-modal-meta" style={{ display: 'block', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Realiza un escaneo de alto rendimiento en tiempo real (línea por línea, sin sobrecargar la memoria del servidor) sobre todos los archivos de logs almacenados localmente y en servidores SSH remotos.
          </p>
        </div>

        {/* Search form */}
        <div style={{ padding: '20px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', position: 'relative', alignItems: 'center' }}>
              <span className="material-icons-round" style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', fontSize: '18px' }}>search</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ingresa tu término de búsqueda (ej: Transacción ID, NullPointerException, Exception, etc.)"
                autoFocus
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '10px 40px 10px 38px',
                  fontSize: '13.5px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="custom-checkbox-container" style={{ gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={isRegex}
                  onChange={(e) => setIsRegex(e.target.checked)}
                />
                <span>Habilitar Expresión Regular (Regex)</span>
              </label>

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="primary-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 20px',
                  fontSize: '12.5px',
                  height: '34px'
                }}
              >
                {loading ? (
                  <>
                    <span className="loader-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>travel_explore</span>
                    <span>Iniciar Búsqueda</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Results Area */}
        <div 
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '20px', 
            background: 'rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {error && (
            <div 
              style={{ 
                padding: '16px', 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px', 
                textAlign: 'center', 
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '24px', opacity: 0.5, marginBottom: '6px', display: 'block' }}>info_outline</span>
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div 
              style={{ 
                padding: '40px 20px', 
                textAlign: 'center', 
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '36px', opacity: 0.3, marginBottom: '8px', display: 'block' }}>search</span>
              Escribe una consulta arriba y haz clic en "Iniciar Búsqueda" para comenzar.
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '4px' }}>
                SE ENCONTRARON COINCIDENCIAS EN {results.length} ARCHIVOS:
              </div>
              {results.map((res) => (
                <div 
                  key={res.fileKey}
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                >
                  <div 
                    onClick={() => handleResultClick(res)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                    title="Hacer clic para abrir este archivo y aplicar filtro"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--accent-solid)' }}>insert_drive_file</span>
                      <span 
                        style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {res.fileName}
                      </span>
                      <span style={{ 
                        fontSize: '9.5px', 
                        color: 'var(--text-muted)',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontWeight: 'normal'
                      }}>
                        {res.originName}
                      </span>
                    </div>
                    <span 
                      style={{ 
                        background: 'rgba(97,175,239,0.15)', 
                        color: '#61afef', 
                        fontSize: '11px', 
                        padding: '2px 8px', 
                        borderRadius: '12px',
                        fontWeight: 'bold'
                      }}
                    >
                      {res.count} {res.count === 1 ? 'coincidencia' : 'coincidencias'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    {res.snippets.map((snip, sidx) => (
                      <div 
                        key={sidx}
                        onClick={() => handleResultClick(res)}
                        style={{
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255,255,255,0.03)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.03)'}
                        title={`Línea ${snip.lineNum}: ${snip.text}`}
                      >
                        <span style={{ color: 'var(--accent-solid)', marginRight: '6px', fontWeight: 'bold' }}>L{snip.lineNum}:</span>
                        {snip.text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>
          <button className="secondary-button" onClick={onClose} style={{ padding: '8px 16px' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
