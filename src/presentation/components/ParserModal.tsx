import React, { useState, useEffect, useMemo } from 'react';
import { ParserConfig, DEFAULT_PARSERS } from '../../domain/models/ParserConfig';
import { getLevelColor } from '../utils/constants';

interface ParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsers: ParserConfig[];
  setParsers: React.Dispatch<React.SetStateAction<ParserConfig[]>>;
}

export const ParserModal: React.FC<ParserModalProps> = ({
  isOpen,
  onClose,
  parsers,
  setParsers
}) => {
  const [selectedParserId, setSelectedParserId] = useState<string>('');
  const [editingParser, setEditingParser] = useState<ParserConfig | null>(null);
  const [testLine, setTestLine] = useState<string>('');
  
  // Si no hay seleccionados, seleccionar el primero por defecto al abrir
  useEffect(() => {
    if (isOpen && parsers.length > 0 && !selectedParserId) {
      setSelectedParserId(parsers[0].id);
    }
  }, [isOpen, parsers, selectedParserId]);

  // Sincronizar el parser en edición con la selección
  useEffect(() => {
    const found = parsers.find(p => p.id === selectedParserId);
    if (found) {
      setEditingParser({ ...found });
    } else {
      setEditingParser(null);
    }
  }, [selectedParserId, parsers]);

  // Manejar cambios en campos de nivel superior
  const handleFieldChange = (field: keyof ParserConfig, value: any) => {
    if (!editingParser) return;
    setEditingParser(prev => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  };

  // Manejar cambios en mapeos de grupos
  const handleMappingChange = (key: keyof ParserConfig['mapping'], value: string) => {
    if (!editingParser) return;
    const parsedNum = value === '' ? undefined : parseInt(value, 10);
    setEditingParser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        mapping: {
          ...prev.mapping,
          [key]: parsedNum
        }
      };
    });
  };

  // Guardar el parser actualmente editado
  const handleSave = () => {
    if (!editingParser) return;
    
    // Validación básica de campos requeridos
    if (!editingParser.name.trim()) {
      alert("Por favor, ingresa un nombre para el parser.");
      return;
    }
    if (!editingParser.regex.trim()) {
      alert("Por favor, ingresa una expresión regular.");
      return;
    }
    
    // Validar que la regex compile
    try {
      new RegExp(editingParser.regex);
    } catch (e) {
      alert("La expresión regular no es válida. Por favor corrígela.");
      return;
    }

    setParsers(prev => prev.map(p => p.id === editingParser.id ? editingParser : p));
    alert("Parser actualizado correctamente.");
  };

  // Activar o desactivar toggle de un parser directamente en la lista
  const handleToggleEnable = (id: string, currentStatus: boolean) => {
    setParsers(prev => prev.map(p => p.id === id ? { ...p, enabled: !currentStatus } : p));
  };

  // Crear un nuevo parser personalizado
  const handleAddNew = () => {
    const newId = 'custom-' + Date.now();
    const newParser: ParserConfig = {
      id: newId,
      name: 'Nuevo Parser Personalizado',
      enabled: true,
      isSystem: false,
      regex: '^(\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2})\\s+\\[([^\\]]+)\\]\\s+(INFO|DEBUG|WARN|ERROR)\\s+-\\s+(.*)$',
      mapping: {
        timestamp: 1,
        thread: 2,
        level: 3,
        message: 4
      }
    };
    setParsers(prev => [...prev, newParser]);
    setSelectedParserId(newId);
  };

  // Eliminar un parser personalizado
  const handleDelete = (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este parser personalizado?")) {
      const remaining = parsers.filter(p => p.id !== id);
      setParsers(remaining);
      if (selectedParserId === id && remaining.length > 0) {
        setSelectedParserId(remaining[0].id);
      }
    }
  };

  // Restablecer valores de fábrica
  const handleResetToDefault = () => {
    if (window.confirm("¿Estás seguro de que deseas restablecer los parsers a la configuración de fábrica? Se perderán todos tus parsers personalizados.")) {
      setParsers(DEFAULT_PARSERS);
      localStorage.setItem('logParsers', JSON.stringify(DEFAULT_PARSERS));
      setSelectedParserId(DEFAULT_PARSERS[0].id);
      alert("Parsers restablecidos correctamente.");
    }
  };

  // Probador de regex en vivo estructurado
  const testResults = useMemo(() => {
    if (!editingParser || !testLine) return null;
    
    let regex: RegExp;
    try {
      regex = new RegExp(editingParser.regex);
    } catch (e: any) {
      return { success: false, error: `Regex Inválida: ${e.message}` };
    }

    const match = testLine.match(regex);
    if (!match) {
      return { success: false, error: 'La línea no coincide con la Expresión Regular.' };
    }

    const mapping = editingParser.mapping;
    const extracted: Record<string, string> = {};

    // Extraer campos mapeados
    const getGroupVal = (idx?: number) => {
      if (idx !== undefined && idx > 0 && idx < match.length) {
        return match[idx] || '-';
      }
      return '-';
    };

    extracted['timestamp'] = getGroupVal(mapping.timestamp);
    extracted['level'] = getGroupVal(mapping.level);
    extracted['thread'] = getGroupVal(mapping.thread);
    extracted['className'] = getGroupVal(mapping.className);
    extracted['message'] = getGroupVal(mapping.message);
    extracted['correlationId'] = getGroupVal(mapping.correlationId);
    extracted['service'] = getGroupVal(mapping.service);

    // Mapeo retrocompatibilidad
    if (extracted['level'].toUpperCase() === 'INPUT') extracted['level'] = 'REQ';
    if (extracted['level'].toUpperCase() === 'OUTPUT') extracted['level'] = 'RESP';
    extracted['level'] = extracted['level'].toUpperCase();

    // Extracciones secundarias si aplican
    if (extracted['correlationId'] === '-' && editingParser.correlationIdRegex) {
      const cMatch = extracted['message'].match(new RegExp(editingParser.correlationIdRegex, 'i'));
      if (cMatch) extracted['correlationId'] = cMatch[1];
    }

    if (extracted['className'] === '-' && editingParser.classNameRegex) {
      const clMatch = extracted['message'].match(new RegExp(editingParser.classNameRegex, 'i'));
      if (clMatch) {
        const clName = clMatch[1];
        extracted['className'] = clName.split('.').pop() || clName;
      }
    } else if (extracted['className'] !== '-' && extracted['className'].includes('.')) {
      extracted['className'] = extracted['className'].split('.').pop() || extracted['className'];
    }

    if (extracted['service'] === '-' && editingParser.serviceRegex) {
      const sMatch = extracted['message'].match(new RegExp(editingParser.serviceRegex, 'i'));
      if (sMatch) extracted['service'] = `API Endpoint ${sMatch[1]}`;
    }

    return {
      success: true,
      extracted,
      groups: match.slice(1) // Grupos de captura crudos para debug
    };
  }, [editingParser, testLine]);

  if (!isOpen) return null;

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 250 }}>
      <div className="compare-modal" style={{ maxWidth: '1050px', width: '95vw', height: '85vh', maxHeight: '800px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Cabecera del modal */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round">tune</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Estructura de Log y Parsers Personalizados</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
                Controla la forma en que el motor extrae información de tus archivos de log.
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} title="Cerrar">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Cuerpo principal en Dos Columnas */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: 'var(--bg-panel)' }}>
          
          {/* Columna Izquierda: Lista de Parsers */}
          <div style={{
            width: '280px',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(21, 24, 30, 0.4)'
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="meta-label" style={{ margin: 0 }}>Formatos Activos</span>
              <button 
                className="primary-button compact-btn" 
                onClick={handleAddNew}
                style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>add</span> Nuevo
              </button>
            </div>

            {/* Lista scrollable de Parsers */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {parsers.map(p => {
                const isSelected = p.id === selectedParserId;
                return (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedParserId(p.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(97, 175, 239, 0.15)' : 'transparent',
                      border: isSelected ? '1px solid rgba(97, 175, 239, 0.4)' : '1px solid transparent',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ 
                        fontWeight: 600, 
                        fontSize: '13px', 
                        color: isSelected ? 'var(--text-accent)' : 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '180px'
                      }}>
                        {p.name}
                      </span>
                      
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <label className="custom-checkbox-container" title={p.enabled ? "Desactivar parser" : "Activar parser"}>
                          <input 
                            type="checkbox" 
                            checked={p.enabled} 
                            onChange={() => handleToggleEnable(p.id, p.enabled)}
                          />
                        </label>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        background: p.isSystem ? 'rgba(97, 175, 239, 0.08)' : 'rgba(229, 192, 123, 0.08)',
                        color: p.isSystem ? '#61afef' : '#e5c07b',
                        border: p.isSystem ? '1px solid rgba(97, 175, 239, 0.2)' : '1px solid rgba(229, 192, 123, 0.2)'
                      }}>
                        {p.isSystem ? 'SISTEMA' : 'CUSTOM'}
                      </span>

                      {!p.isSystem && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          className="hover-red-button"
                          title="Eliminar parser"
                        >
                          <span className="material-icons-round" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón de restablecer al final de la barra lateral */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button 
                className="secondary-button" 
                style={{ width: '100%', fontSize: '11px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                onClick={handleResetToDefault}
              >
                <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                Restablecer Fábrica
              </button>
            </div>
          </div>

          {/* Columna Derecha: Editor del Parser & Probador en Vivo */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {editingParser ? (
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Cabecera de Edición */}
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-accent)' }}>
                      {editingParser.isSystem ? 'Visualizando' : 'Configurando'}: {editingParser.name}
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      ID de Registro: <code>{editingParser.id}</code> {editingParser.isSystem && ' (Solo Lectura)'}
                    </p>
                  </div>
                  
                  {!editingParser.isSystem && (
                    <button className="primary-button" onClick={handleSave}>
                      <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '4px' }}>save</span>
                      Guardar Cambios
                    </button>
                  )}
                </div>

                {/* Formulario de Configuración Básica */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="meta-label">Nombre del Formato</span>
                    <input 
                      type="text" 
                      value={editingParser.name}
                      onChange={e => handleFieldChange('name', e.target.value)}
                      disabled={editingParser.isSystem}
                      style={{
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        fontSize: '13px'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="meta-label">Expresión Regular Principal (Regex)</span>
                    <textarea 
                      value={editingParser.regex}
                      onChange={e => handleFieldChange('regex', e.target.value)}
                      disabled={editingParser.isSystem}
                      rows={3}
                      style={{
                        background: '#151515',
                        color: '#abb2bf',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        resize: 'vertical'
                      }}
                      placeholder="Ej. ^(\d{4}-\d{2}-\d{2})\s+\[([^\]]+)\]\s+(.*)$"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      💡 La regex debe abarcar la estructura completa de un registro y contener grupos de captura <code>( )</code> para mapear los campos.
                    </span>
                  </div>
                </div>

                {/* Mapeo de Campos e Índices */}
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    Mapeo de Grupos de Captura (Índice 1-9)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Marca de Tiempo (Timestamp) *</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.timestamp || ''}
                        onChange={e => handleMappingChange('timestamp', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Nivel de Severidad (Level) *</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.level || ''}
                        onChange={e => handleMappingChange('level', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Mensaje Principal (Message) *</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.message || ''}
                        onChange={e => handleMappingChange('message', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Hilo de Ejecución (Thread)</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.thread || ''}
                        onChange={e => handleMappingChange('thread', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Clase / Logger (ClassName)</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.className || ''}
                        onChange={e => handleMappingChange('className', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>ID de Correlación (CorrelationId)</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.correlationId || ''}
                        onChange={e => handleMappingChange('correlationId', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Servicio o Endpoint</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="9"
                        value={editingParser.mapping.service || ''}
                        onChange={e => handleMappingChange('service', e.target.value)}
                        disabled={editingParser.isSystem}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
                      />
                    </div>

                  </div>
                </div>

                {/* Expresiones Regulares Secundarias */}
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    Extracciones Secundarias (Regex aplicadas sobre el Mensaje/Campos)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Regex de ID de Correlación Secundario</span>
                      <input 
                        type="text" 
                        value={editingParser.correlationIdRegex || ''}
                        onChange={e => handleFieldChange('correlationIdRegex', e.target.value)}
                        disabled={editingParser.isSystem}
                        placeholder="Ej. ssn:\s*([^\s\-]+) o Peticion\s*ID:\s*([^\s\]]+)"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 10px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Regex de Clase Secundaria</span>
                      <input 
                        type="text" 
                        value={editingParser.classNameRegex || ''}
                        onChange={e => handleFieldChange('classNameRegex', e.target.value)}
                        disabled={editingParser.isSystem}
                        placeholder="Ej. Class:\s*([^\s\]]+)"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 10px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="meta-label" style={{ fontSize: '11px' }}>Regex de Servicio / Endpoint Secundario</span>
                      <input 
                        type="text" 
                        value={editingParser.serviceRegex || ''}
                        onChange={e => handleFieldChange('serviceRegex', e.target.value)}
                        disabled={editingParser.isSystem}
                        placeholder="Ej. Endpoint:\s*([^\s\]]+)"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 10px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>

                  </div>
                </div>

                {/* Probador en Vivo */}
                <div style={{
                  background: 'rgba(30, 34, 42, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: '#e5c07b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-icons-round" style={{ fontSize: '18px' }}>bug_report</span>
                      Probador de Expresión Regular en Vivo
                    </h4>
                    {testResults && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: testResults.success ? 'rgba(78, 169, 78, 0.15)' : 'rgba(244, 67, 54, 0.15)',
                        color: testResults.success ? '#4caf50' : '#f44336'
                      }}>
                        {testResults.success ? '✓ COINCIDENCIA EXITOSA' : '✗ SIN COINCIDENCIA'}
                      </span>
                    )}
                  </div>

                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                    Pega una línea de registro real de tu archivo para probar si tu patrón Regex coincide y extrae los grupos de manera correcta en tiempo real.
                  </p>

                  <textarea 
                    value={testLine}
                    onChange={e => setTestLine(e.target.value)}
                    placeholder="Pega una línea de log aquí. Ej: 2026-05-21 16:54:48,123 INFO main [CoreController] Procesando petición ID: ssn-12345"
                    rows={2}
                    style={{
                      width: '100%',
                      background: '#1a1d24',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      resize: 'none'
                    }}
                  />

                  {/* Resultados del Testeo */}
                  {testResults && (
                    <div style={{ marginTop: '4px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
                      {testResults.success && testResults.extracted ? (
                        <div>
                          <span className="meta-label" style={{ marginBottom: '8px', display: 'block', fontSize: '11px', color: '#98c379' }}>CAMPOS EXTRAÍDOS CORRECTAMENTE:</span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                            
                            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>Fecha/Hora:</span>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>{testResults.extracted.timestamp}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>Nivel:</span>
                              {testResults.extracted.level !== '-' ? (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  color: `hsl(${getLevelColor(testResults.extracted.level)})`,
                                  background: `hsla(${getLevelColor(testResults.extracted.level)}, 0.1)`,
                                  border: `1px solid hsla(${getLevelColor(testResults.extracted.level)}, 0.2)`
                                }}>
                                  {testResults.extracted.level}
                                </span>
                              ) : <span>-</span>}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>Hilo:</span>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>{testResults.extracted.thread}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>Clase/Logger:</span>
                              <span style={{ color: '#e5c07b' }}>{testResults.extracted.className}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>Correlación ID:</span>
                              <span style={{ color: '#61afef', fontFamily: 'var(--font-mono)' }}>{testResults.extracted.correlationId}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>Servicio/API:</span>
                              <span style={{ color: '#c678dd' }}>{testResults.extracted.service}</span>
                            </div>

                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginTop: '8px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Mensaje Parseado:</span>
                            <div style={{
                              maxHeight: '100px',
                              overflowY: 'auto',
                              padding: '8px',
                              background: '#15181f',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              whiteSpace: 'pre-wrap',
                              fontSize: '11px'
                            }}>{testResults.extracted.message}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: '#f44336', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="material-icons-round" style={{ fontSize: '16px' }}>error_outline</span>
                          <span>{testResults.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
                <span className="material-icons-round" style={{ fontSize: '48px' }}>view_sidebar</span>
                <span>Selecciona o crea un parser de la barra lateral para editarlo.</span>
              </div>
            )}
          </div>

        </div>

        {/* Pie del modal */}
        <div className="compare-modal-body" style={{ 
          background: 'rgba(21, 24, 30, 0.95)', 
          borderTop: '1px solid var(--border-color)', 
          padding: '16px 24px', 
          display: 'flex', 
          justifyContent: 'flex-end', 
          alignItems: 'center',
          gap: '12px',
          flex: 'none'
        }}>
          <button className="secondary-button" onClick={onClose} style={{ padding: '8px 20px' }}>
            Listo / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
