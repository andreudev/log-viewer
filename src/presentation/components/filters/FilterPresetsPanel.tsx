import React, { useState } from 'react';
import { FilterPreset } from '../../../domain/models/FilterPreset';

interface FilterPresetsPanelProps {
  presets: FilterPreset[];
  activePresetId: string | null;
  onApplyPreset: (preset: FilterPreset) => void;
  onDeletePreset: (id: string) => void;
  onSaveCurrentFilter: (name: string, icon: string) => void;
}

export const FilterPresetsPanel: React.FC<FilterPresetsPanelProps> = ({
  presets,
  activePresetId,
  onApplyPreset,
  onDeletePreset,
  onSaveCurrentFilter
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('filter_alt');

  const iconsList = ['filter_alt', 'star', 'bug_report', 'flash_on', 'schedule', 'api'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    onSaveCurrentFilter(presetName.trim(), selectedIcon);
    setPresetName('');
    setIsSaving(false);
  };

  return (
    <div className="filter-presets-panel animate-fade-in">
      <span className="presets-label">Presets:</span>
      
      <div className="presets-scroll-area">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <div
              key={preset.id}
              className={`preset-pill ${isActive ? 'active' : ''}`}
              onClick={() => onApplyPreset(preset)}
              title="Click para aplicar filtros guardados"
            >
              <span className="material-icons-round">{preset.icon || 'filter_alt'}</span>
              <span>{preset.name}</span>
              <button
                className="preset-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePreset(preset.id);
                }}
                title="Eliminar Preset"
              >
                <span className="material-icons-round" style={{ fontSize: '12px' }}>close</span>
              </button>
            </div>
          );
        })}

        {isSaving ? (
          <form onSubmit={handleSubmit} className="preset-form">
            <input
              type="text"
              className="preset-form-input"
              placeholder="Nombre..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              autoFocus
              maxLength={20}
            />
            
            {/* Small icon selector */}
            <div style={{ display: 'flex', gap: '2px', marginRight: '4px' }}>
              {iconsList.map(icon => (
                <button
                  type="button"
                  key={icon}
                  className={`preset-form-btn ${selectedIcon === icon ? 'save-confirm' : ''}`}
                  onClick={() => setSelectedIcon(icon)}
                  title={`Icono ${icon}`}
                  style={{ 
                    color: selectedIcon === icon ? '#98c379' : 'rgba(255,255,255,0.4)',
                    background: selectedIcon === icon ? 'rgba(152,195,121,0.1)' : 'transparent'
                  }}
                >
                  <span className="material-icons-round" style={{ fontSize: '12px' }}>{icon}</span>
                </button>
              ))}
            </div>

            <div className="preset-form-actions">
              <button type="submit" className="preset-form-btn save-confirm" title="Guardar Preset">
                <span className="material-icons-round">check</span>
              </button>
              <button
                type="button"
                className="preset-form-btn"
                onClick={() => setIsSaving(false)}
                title="Cancelar"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
          </form>
        ) : (
          <button
            className="preset-save-btn"
            onClick={() => setIsSaving(true)}
            title="Guardar filtros actuales como preset"
          >
            <span className="material-icons-round">save</span>
            <span>Guardar Filtro</span>
          </button>
        )}
      </div>
    </div>
  );
};
