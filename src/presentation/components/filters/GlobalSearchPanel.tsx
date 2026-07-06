import React, { useState } from 'react';
import { executeGlobalSearch, GlobalSearchResult } from '../../../infrastructure/api/filesApi';

interface GlobalSearchPanelProps {
  handleFileSelectOnly: (fileKey: string) => void;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  handleFileSelectOnly,
  setFilters,
  setCurrentPage
}) => {
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await executeGlobalSearch(query, isRegex);
      setResults(data);
      if (data.length === 0) {
        setError('No se encontraron coincidencias.');
      }
    } catch (err: any) {
      setError(err.message || 'Error en la búsqueda global');
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (result: GlobalSearchResult) => {
    // Switch active file in the sidebar
    handleFileSelectOnly(result.fileKey);
    // Apply search filter and go to page 1
    setFilters((f: any) => ({
      ...f,
      searchTerm: query,
      isRegexSearch: isRegex
    }));
    setCurrentPage(1);
  };

  return (
    <div className="sidebar-section global-search-section">
      <div 
        className="section-title" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-icons-round" style={{ fontSize: '15px' }}>travel_explore</span>
          BÚSQUEDA GLOBAL CRUZADA
        </span>
        <span className="material-icons-round" style={{ fontSize: '16px' }}>
          {isCollapsed ? 'expand_more' : 'expand_less'}
        </span>
      </div>

      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '6px 12px 12px 12px', animation: 'tail-fade-in 0.2s ease-out' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', position: 'relative', alignItems: 'center' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en todos los logs..."
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '8px 30px 8px 10px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="custom-checkbox-container" style={{ gap: '6px', fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={isRegex}
                  onChange={(e) => setIsRegex(e.target.checked)}
                />
                <span>Regex (.*)</span>
              </label>

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="primary-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  height: '26px'
                }}
              >
                {loading ? (
                  <>
                    <span className="loader-spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons-round" style={{ fontSize: '14px' }}>search</span>
                    <span>Buscar</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '6px' }}>
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div 
              className="global-search-results" 
              style={{ 
                maxHeight: '220px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px',
                marginTop: '4px',
                paddingRight: '2px'
              }}
            >
              {results.map((res) => (
                <div 
                  key={res.fileKey}
                  style={{
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div 
                    onClick={() => handleResultClick(res)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                    title="Hacer clic para abrir este archivo y aplicar filtro"
                  >
                    <span 
                      style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        marginRight: '6px'
                      }}
                    >
                      {res.fileName}
                    </span>
                    <span 
                      style={{ 
                        background: 'rgba(97,175,239,0.15)', 
                        color: '#61afef', 
                        fontSize: '9.5px', 
                        padding: '2px 6px', 
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      {res.count}
                    </span>
                  </div>

                  <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                    Origen: {res.originName}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                    {res.snippets.map((snip, sidx) => (
                      <div 
                        key={sidx}
                        onClick={() => handleResultClick(res)}
                        style={{
                          background: 'rgba(0,0,0,0.15)',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer'
                        }}
                        title={`Línea ${snip.lineNum}: ${snip.text}`}
                      >
                        <span style={{ color: 'var(--accent-solid)', marginRight: '4px' }}>L{snip.lineNum}:</span>
                        {snip.text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
