import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Navegación en el Feed',
      items: [
        { keys: ['j', '↓'], desc: 'Mover selección al siguiente log en la grilla' },
        { keys: ['k', '↑'], desc: 'Mover selección al log anterior en la grilla' },
      ],
    },
    {
      title: 'Acciones de Log (Fila Activa)',
      items: [
        { keys: ['o', 'Enter'], desc: 'Abrir detalles del log seleccionado en el panel lateral' },
        { keys: ['p'], desc: 'Marcar / Fijar el log seleccionado (Guardar en Favoritos)' },
        { keys: ['c'], desc: 'Agregar / Quitar de la cola de comparación de payloads' },
      ],
    },
    {
      title: 'Búsqueda y Diálogos',
      items: [
        { keys: ['/'], desc: 'Enfocar instantáneamente la barra de búsqueda principal' },
        { keys: ['Esc'], desc: 'Cerrar paneles abiertos, modal activo o desenfocar el buscador' },
      ],
    },
  ];

  return (
    <div 
      className="compare-modal-overlay" 
      style={{ zIndex: 350 }} 
      onClick={onClose}
    >
      <div 
        className="compare-modal" 
        style={{ maxWidth: '500px', maxHeight: '550px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round" style={{ color: 'var(--color-primary)' }}>keyboard</span>
            <h2>Guía de Atajos de Teclado</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Cerrar modal">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Modal Description */}
        <div className="compare-modal-meta" style={{ display: 'block', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Aumenta tu productividad de análisis de logs utilizando estos atajos rápidos inspirados en Vim y Gmail. Asegúrate de no estar editando un cuadro de texto al usarlos.
          </p>
        </div>

        {/* Modal Body */}
        <div 
          className="compare-modal-body" 
          style={{ 
            flexDirection: 'column', 
            padding: '20px', 
            gap: '20px', 
            background: 'var(--bg-panel)',
            overflowY: 'auto' 
          }}
        >
          {shortcutGroups.map((group, groupIdx) => (
            <div key={groupIdx} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: '11px', 
                fontWeight: 700, 
                color: 'var(--color-primary, #61afef)', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em' 
              }}>
                {group.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map((item, itemIdx) => (
                  <div 
                    key={itemIdx} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      gap: '12px'
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', flex: 1, lineHeight: '1.4' }}>
                      {item.desc}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {item.keys.map((key, keyIdx) => (
                        <React.Fragment key={keyIdx}>
                          {keyIdx > 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>o</span>}
                          <kbd style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '22px',
                            height: '22px',
                            padding: '0 6px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            fontFamily: 'var(--font-mono)',
                            color: '#e5c07b',
                            background: '#282c34',
                            border: '1px solid #4b5263',
                            borderRadius: '4px',
                            boxShadow: '0 2px 0 0 #1e2127',
                            textTransform: 'none'
                          }}>
                            {key}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Modal Footer / Close Action */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <button className="primary-button" onClick={onClose} style={{ padding: '8px 16px' }}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
