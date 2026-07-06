import React from 'react';

interface RulesModalProps {
  isRulesModalOpen: boolean;
  setIsRulesModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rulesJsonInput: string;
  setRulesJsonInput: React.Dispatch<React.SetStateAction<string>>;
  jsonError: string | null;
  handleSaveRulesJson: () => void;
  setRulesJsonInputToDefault: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isRulesModalOpen,
  setIsRulesModalOpen,
  rulesJsonInput,
  setRulesJsonInput,
  jsonError,
  handleSaveRulesJson,
  setRulesJsonInputToDefault
}) => {
  if (!isRulesModalOpen) return null;

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 300 }}>
      <div className="compare-modal" style={{ maxWidth: '600px', maxHeight: '550px' }}>
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round">rule</span>
            <h2>Editor de Reglas de Alerta QA</h2>
          </div>
          <button className="icon-button" onClick={() => setIsRulesModalOpen(false)}>
            <span className="material-icons-round">close</span>
          </button>
        </div>
        
        <div className="compare-modal-meta" style={{ display: 'block', padding: '12px 20px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
            Define reglas para elevar automáticamente la severidad de los logs silenciosos (ej. DEBUG, INFO) a niveles críticos (ej. WARN, ERROR) cuando contienen ciertos patrones de texto.
          </p>
        </div>
        
        <div className="compare-modal-body" style={{ flexDirection: 'column', padding: '16px', gap: '12px', background: 'var(--bg-panel)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="meta-label">Configuración en JSON</span>
            <textarea 
              value={rulesJsonInput}
              onChange={e => setRulesJsonInput(e.target.value)}
              style={{
                flex: 1,
                width: '100%',
                background: '#151515',
                color: '#d4d4d4',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                padding: '10px',
                resize: 'none',
                minHeight: '220px'
              }}
            />
            {jsonError && (
              <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 600 }}>
                ⚠️ {jsonError}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <button 
              className="secondary-button" 
              onClick={setRulesJsonInputToDefault}
            >
              Restablecer por defecto
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="secondary-button" onClick={() => setIsRulesModalOpen(false)}>
                Cancelar
              </button>
              <button className="primary-button" onClick={handleSaveRulesJson}>
                Guardar Reglas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
