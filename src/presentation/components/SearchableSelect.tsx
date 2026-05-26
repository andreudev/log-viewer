import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  icon = 'filter_alt'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    const opt = options.find(o => o.value === value);
    return opt ? opt.label : placeholder;
  }, [options, value, placeholder]);

  return (
    <div 
      className="searchable-select-container" 
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: '220px',
        maxWidth: '280px',
        zIndex: 50
      }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 10px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: isOpen ? '1px solid var(--color-primary, #61afef)' : '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '11px',
          boxShadow: 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--text-muted)' }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedLabel}
          </span>
        </div>
        <span className="material-icons-round" style={{ 
          fontSize: '16px', 
          color: 'var(--text-muted)',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s ease'
        }}>
          expand_more
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="searchable-select-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-panel, #1e2127)',
            border: '1px solid var(--border-color, #3e4452)',
            borderRadius: '6px',
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backdropFilter: 'blur(16px)',
            webkitBackdropFilter: 'blur(16px)'
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span className="material-icons-round" style={{ 
              position: 'absolute', 
              left: '8px', 
              fontSize: '14px', 
              color: 'var(--text-muted)' 
            }}>
              search
            </span>
            <input
              type="text"
              placeholder="Buscar servicio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '6px 8px 6px 26px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-color, #3e4452)',
                borderRadius: '4px',
                color: 'var(--text-primary, #abb2bf)',
                fontSize: '11px',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  e.stopPropagation();
                }
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
              </button>
            )}
          </div>

          {/* Options List */}
          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              paddingRight: '2px'
            }}
          >
            {filteredOptions.length === 0 ? (
              <div style={{ 
                padding: '8px', 
                fontSize: '11px', 
                color: 'var(--text-muted)', 
                textAlign: 'center' 
              }}>
                Sin resultados
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: isSelected 
                        ? 'var(--accent-bg, rgba(97, 175, 239, 0.12))' 
                        : 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: isSelected 
                        ? 'var(--color-primary, #61afef)' 
                        : 'var(--text-secondary, #abb2bf)',
                      fontSize: '11px',
                      fontWeight: isSelected ? 600 : 400,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s ease',
                      fontFamily: 'var(--font-mono, monospace)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={opt.label}>
                      {opt.label}
                    </span>
                    {isSelected && (
                      <span className="material-icons-round" style={{ fontSize: '13px', marginLeft: '6px' }}>
                        check
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
