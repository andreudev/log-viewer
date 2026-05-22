import React, { useState, useRef, useEffect } from 'react';
import { FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { LogLevel } from '../../domain/models/LogEntry';
import { defaultLevels } from '../../domain/parsing/parseLogs';
import { toLocalISOString } from '../utils/helpers';
import { LOG_LEVELS, getLevelColor } from '../utils/constants';
import { SearchableSelect } from './SearchableSelect';

import { LogEntry } from '../../domain/models/LogEntry';

interface FiltersPanelProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  uniqueServices: string[];
  handleLevelClick: (level: LogLevel) => void;
  setSortColumn: React.Dispatch<React.SetStateAction<SortColumn>>;
  setSortDirection: React.Dispatch<React.SetStateAction<SortDirection>>;
  logDateRange: { min: Date | null; max: Date | null; minStr: string; maxStr: string };
  applyTimePreset: (minutes: number) => void;
  applyFullDateRange: () => void;
  filteredLogs: LogEntry[];
  setActiveLog: (log: LogEntry | null) => void;
  setIsDrawerOpen: (isOpen: boolean) => void;
  availableLevels: string[];
}

export const FiltersPanel: React.FC<FiltersPanelProps> = ({
  filters,
  setFilters,
  setCurrentPage,
  uniqueServices,
  handleLevelClick,
  setSortColumn,
  setSortDirection,
  logDateRange,
  applyTimePreset,
  applyFullDateRange,
  filteredLogs,
  setActiveLog,
  setIsDrawerOpen,
  availableLevels
}) => {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const getSafeDate = (d: any): Date | null => {
    if (!d) return null;
    const dateObj = (d instanceof Date) ? d : new Date(d);
    return !isNaN(dateObj.getTime()) ? dateObj : null;
  };

  const activeLevels = filters.activeLevels instanceof Set 
    ? filters.activeLevels 
    : new Set(filters.activeLevels || []);

  // Estados locales para el Custom Date & Time Picker interactivo
  const [tempDateFrom, setTempDateFrom] = useState<Date | null>(() => getSafeDate(filters.dateFrom));
  const [tempDateTo, setTempDateTo] = useState<Date | null>(() => getSafeDate(filters.dateTo));
  const [activeTab, setActiveTab] = useState<'from' | 'to'>('from');
  const [viewDate, setViewDate] = useState<Date>(() => {
    const safeFrom = getSafeDate(filters.dateFrom);
    const safeTo = getSafeDate(filters.dateTo);
    const safeMin = getSafeDate(logDateRange.min);
    const initialDate = safeFrom || safeTo || safeMin || new Date();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });

  const [isUmlCollapsed, setIsUmlCollapsed] = useState(false);

  // Heurística de Actores para Diagrama UML
  const getUmlActors = (log: LogEntry, prevActor: string): { from: string; to: string; type: 'call' | 'return' | 'local' } => {
    const service = log.service || '';
    const className = (log.className || '').toLowerCase();
    const msg = (log.message || '').toLowerCase();
    const level = log.level || 'INFO';

    const isExternal = className.includes('soap') || 
                       className.includes('connector') || 
                       className.includes('external') || 
                       className.includes('ach') || 
                       (className.includes('client') && (msg.includes('http') || msg.includes('soap') || msg.includes('xml')));
    const isController = className.includes('controller') || 
                         className.includes('resource') || 
                         className.includes('api') || 
                         (service !== '-' && service !== '');

    if (level === 'REQ') {
      if (isExternal) return { from: 'CORE_APP', to: 'EXTERNAL', type: 'call' };
      if (isController) return { from: 'CLIENT', to: 'GATEWAY', type: 'call' };
      return { from: 'GATEWAY', to: 'CORE_APP', type: 'call' };
    }

    if (level === 'RESP') {
      if (isExternal) return { from: 'EXTERNAL', to: 'CORE_APP', type: 'return' };
      if (isController) return { from: 'GATEWAY', to: 'CLIENT', type: 'return' };
      return { from: 'CORE_APP', to: 'GATEWAY', type: 'return' };
    }

    if (level === 'ERROR') {
      if (isExternal) return { from: 'EXTERNAL', to: 'CORE_APP', type: 'return' };
      return { from: 'CORE_APP', to: 'GATEWAY', type: 'return' };
    }

    if (isExternal) return { from: 'CORE_APP', to: 'EXTERNAL', type: 'call' };
    if (isController) return { from: 'GATEWAY', to: 'CORE_APP', type: 'call' };

    return { from: prevActor || 'CORE_APP', to: prevActor || 'CORE_APP', type: 'local' };
  };

  const handleExportPlantUML = () => {
    let plantUmlText = "@startuml\n";
    plantUmlText += "autonumber\n";
    plantUmlText += "skinparam backgroundColor #282c34\n";
    plantUmlText += "skinparam actorBorderColor #61afef\n";
    plantUmlText += "skinparam actorBackgroundColor #1e2127\n";
    plantUmlText += "skinparam actorFontColor #abb2bf\n";
    plantUmlText += "skinparam sequenceLifeLineBorderColor #4b5263\n";
    plantUmlText += "skinparam sequenceArrowColor #61afef\n";
    plantUmlText += "skinparam sequenceArrowFontColor #e5c07b\n";
    plantUmlText += "skinparam sequenceBoxBorderColor #4b5263\n";
    plantUmlText += "skinparam sequenceBoxBackgroundColor #21252b\n";
    plantUmlText += "skinparam sequenceBoxFontColor #abb2bf\n\n";

    plantUmlText += "actor Client #1e2127\n";
    plantUmlText += "box \"Capa Media LogScope\" #21252b\n";
    plantUmlText += "  participant Gateway #282c34\n";
    plantUmlText += "  participant Core_App #282c34\n";
    plantUmlText += "end box\n";
    plantUmlText += "participant External_Integration #282c34\n\n";

    let lastActor = 'CLIENT';
    filteredLogs.forEach((log) => {
      const { from, to, type } = getUmlActors(log, lastActor);
      const actorFrom = from === 'CORE_APP' ? 'Core_App' : from === 'EXTERNAL' ? 'External_Integration' : from === 'GATEWAY' ? 'Gateway' : 'Client';
      const actorTo = to === 'CORE_APP' ? 'Core_App' : to === 'EXTERNAL' ? 'External_Integration' : to === 'GATEWAY' ? 'Gateway' : 'Client';
      
      const latencyStr = log.deltaTimeMs !== undefined 
        ? (log.deltaTimeMs >= 1000 ? ` (+${(log.deltaTimeMs / 1000).toFixed(2)}s)` : ` (+${log.deltaTimeMs}ms)`) 
        : '';
        
      let actionName = (log.service !== '-' ? log.service : log.className) || '-';
      if (actionName.length > 50) actionName = actionName.substring(0, 50) + '...';
      
      const arrow = type === 'return' ? '-->' : '->';
      const errorSuffix = log.level === 'ERROR' ? ' [ERROR]' : '';
      
      plantUmlText += `${actorFrom} ${arrow} ${actorTo} : ${actionName}${latencyStr}${errorSuffix}\n`;
      lastActor = to;
    });

    plantUmlText += "\n@enduml";
    
    navigator.clipboard.writeText(plantUmlText).then(() => {
      alert("¡Código PlantUML copiado al portapapeles con éxito! Puedes pegarlo en http://www.plantuml.com/plantuml o importarlo directamente.");
    }).catch(err => {
      console.error("No se pudo copiar el PlantUML", err);
    });
  };

  // Sincronizar estados locales con filtros activos al abrir el popover
  useEffect(() => {
    if (isDatePickerOpen) {
      setTempDateFrom(getSafeDate(filters.dateFrom));
      setTempDateTo(getSafeDate(filters.dateTo));
      
      const safeFrom = getSafeDate(filters.dateFrom);
      const safeTo = getSafeDate(filters.dateTo);
      const safeMin = getSafeDate(logDateRange.min);
      const initialDate = safeFrom || safeTo || safeMin || new Date();
      setViewDate(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
      setActiveTab('from');
    }
  }, [isDatePickerOpen, filters.dateFrom, filters.dateTo, logDateRange.min]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lógica de navegación y cuadrícula del Calendario
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const WEEKDAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  const daysArray = React.useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days = [];

    // Rellenar días del mes anterior
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        day: prevMonthTotalDays - i,
        month: month === 0 ? 11 : month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false
      });
    }

    // Rellenar días del mes actual
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        day: i,
        month,
        year,
        isCurrentMonth: true
      });
    }

    // Rellenar días del mes siguiente
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false
      });
    }

    return days;
  }, [year, month]);

  const handleDayClick = (dayObj: { day: number; month: number; year: number }) => {
    const clickedDate = new Date(dayObj.year, dayObj.month, dayObj.day);
    
    if (activeTab === 'from') {
      const hours = tempDateFrom ? tempDateFrom.getHours() : 0;
      const minutes = tempDateFrom ? tempDateFrom.getMinutes() : 0;
      clickedDate.setHours(hours, minutes, 0, 0);
      setTempDateFrom(clickedDate);
      setActiveTab('to'); // Auto-avanzar interactivo
    } else {
      const hours = tempDateTo ? tempDateTo.getHours() : 23;
      const minutes = tempDateTo ? tempDateTo.getMinutes() : 59;
      clickedDate.setHours(hours, minutes, 59, 999);
      setTempDateTo(clickedDate);
    }
  };

  const safeActiveDate = getSafeDate(activeTab === 'from' ? tempDateFrom : tempDateTo);
  const currentHours = safeActiveDate ? safeActiveDate.getHours() : (activeTab === 'from' ? 0 : 23);
  const currentMinutes = safeActiveDate ? safeActiveDate.getMinutes() : (activeTab === 'from' ? 0 : 59);

  const handleTimeChange = (hours: number, minutes: number) => {
    if (activeTab === 'from') {
      const safeFrom = getSafeDate(tempDateFrom);
      const base = safeFrom ? new Date(safeFrom) : new Date();
      base.setHours(hours, minutes, 0, 0);
      setTempDateFrom(base);
    } else {
      const safeTo = getSafeDate(tempDateTo);
      const base = safeTo ? new Date(safeTo) : new Date();
      base.setHours(hours, minutes, 59, 999);
      setTempDateTo(base);
    }
  };

  const incrementHours = () => {
    const nextH = (currentHours + 1) % 24;
    handleTimeChange(nextH, currentMinutes);
  };

  const decrementHours = () => {
    const prevH = (currentHours - 1 + 24) % 24;
    handleTimeChange(prevH, currentMinutes);
  };

  const incrementMinutes = () => {
    const nextM = (currentMinutes + 1) % 60;
    handleTimeChange(currentHours, nextM);
  };

  const decrementMinutes = () => {
    const prevM = (currentMinutes - 1 + 60) % 60;
    handleTimeChange(currentHours, prevM);
  };

  const formatDateShort = (d: any) => {
    const safeD = getSafeDate(d);
    if (!safeD) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(safeD.getDate())}/${pad(safeD.getMonth() + 1)} ${pad(safeD.getHours())}:${pad(safeD.getMinutes())}`;
  };

  const activeDateLabel = React.useMemo(() => {
    const safeFrom = getSafeDate(filters.dateFrom);
    const safeTo = getSafeDate(filters.dateTo);
    if (!safeFrom && !safeTo) {
      return 'Todo el tiempo';
    }
    
    const formatDateShortLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      return `${day}/${month} ${hours}:${mins}`;
    };

    const fromStr = safeFrom ? formatDateShortLocal(safeFrom) : 'Inicio';
    const toStr = safeTo ? formatDateShortLocal(safeTo) : 'Ahora';
    return `${fromStr} - ${toStr}`;
  }, [filters.dateFrom, filters.dateTo]);

  return (
    <section className="filter-panel">
      {filters.correlationId && (
        <div className="uml-sequence-panel">
          <div className="flow-isolation-banner">
            <div className="banner-left">
              <span className="material-icons-round text-accent">insights</span>
              <span>Aislamiento de Flujo Activo: <code>{filters.correlationId}</code></span>
            </div>
            <div className="banner-right">
              <button 
                type="button"
                className="secondary-button compact-btn uml-toggle-btn" 
                onClick={() => setIsUmlCollapsed(!isUmlCollapsed)}
                title={isUmlCollapsed ? "Mostrar Diagrama UML" : "Colapsar Diagrama UML"}
              >
                <span className="material-icons-round" style={{ fontSize: 16 }}>
                  {isUmlCollapsed ? 'unfold_more' : 'unfold_less'}
                </span>
                <span>{isUmlCollapsed ? 'Mostrar Diagrama' : 'Ocultar Diagrama'}</span>
              </button>
              <button 
                type="button"
                className="secondary-button compact-btn uml-export-btn"
                onClick={handleExportPlantUML}
                title="Copiar código compatible con PlantUML"
              >
                <span className="material-icons-round" style={{ fontSize: 16 }}>content_paste_go</span>
                <span>Exportar PlantUML</span>
              </button>
              <button 
                type="button"
                className="secondary-button compact-btn close-flow-btn" 
                onClick={() => setFilters(p => ({ ...p, correlationId: null }))}
              >
                <span className="material-icons-round" style={{ fontSize: 16 }}>close</span>
                <span>Restablecer</span>
              </button>
            </div>
          </div>

          {!isUmlCollapsed && (
            <div className="uml-diagram-container">
              {(() => {
                const actors = ['CLIENT', 'GATEWAY', 'CORE_APP', 'EXTERNAL'];
                const actorLabels: Record<string, string> = {
                  CLIENT: 'Cliente',
                  GATEWAY: 'Gateway',
                  CORE_APP: 'Capa Media (Core)',
                  EXTERNAL: 'Ext (SOAP/ACH)'
                };
                const posX: Record<string, number> = {
                  CLIENT: 100,
                  GATEWAY: 300,
                  CORE_APP: 500,
                  EXTERNAL: 700
                };
                
                const steps: Array<{
                  log: LogEntry;
                  from: string;
                  to: string;
                  type: 'call' | 'return' | 'local';
                }> = [];
                
                const MAX_UML_STEPS = 150;
                let lastActor = 'CLIENT';
                filteredLogs.forEach(log => {
                  const info = getUmlActors(log, lastActor);
                  steps.push({
                    log,
                    from: info.from,
                    to: info.to,
                    type: info.type
                  });
                  lastActor = info.to;
                });

                const totalSteps = steps.length;
                const isTruncated = totalSteps > MAX_UML_STEPS;
                const visibleSteps = isTruncated ? steps.slice(0, MAX_UML_STEPS) : steps;

                const stepHeight = 70;
                const headerHeight = 80;
                const bannerHeight = isTruncated ? 50 : 0;
                const totalSvgHeight = Math.max(220, headerHeight + visibleSteps.length * stepHeight + 50 + bannerHeight);

                return (
                  <div className="uml-svg-viewport">
                    {isTruncated && (
                      <div className="uml-truncation-banner">
                        <span className="material-icons-round" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>warning_amber</span>
                        Diagrama truncado: mostrando {MAX_UML_STEPS} de {totalSteps} pasos para preservar el rendimiento del navegador.
                      </div>
                    )}
                    <svg width="100%" height={totalSvgHeight} viewBox={`0 0 800 ${totalSvgHeight}`} className="uml-svg">
                      <defs>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>

                      {/* Líneas de vida verticales de los actores */}
                      {actors.map(actor => (
                        <line 
                          key={actor}
                          x1={posX[actor]} 
                          y1={headerHeight - 20} 
                          x2={posX[actor]} 
                          y2={totalSvgHeight - 40} 
                          className="uml-lifeline" 
                        />
                      ))}

                      {/* Encabezados de los actores */}
                      {actors.map(actor => (
                        <g key={actor} className="uml-actor-node">
                          <rect 
                            x={posX[actor] - 70} 
                            y={15} 
                            width={140} 
                            height={40} 
                            rx={8} 
                            className={`uml-actor-box uml-actor-${actor.toLowerCase()}`} 
                          />
                          <text 
                            x={posX[actor]} 
                            y={39} 
                            className="uml-actor-text"
                          >
                            {actorLabels[actor]}
                          </text>
                        </g>
                      ))}

                      {/* Flechas e interacciones (Pasos) */}
                      {visibleSteps.map((step, idx) => {
                        const y = headerHeight + idx * stepHeight + 30;
                        const x1 = posX[step.from];
                        const x2 = posX[step.to];
                        const delta = step.log.deltaTimeMs;
                        
                        const latencyText = delta !== undefined 
                          ? (delta >= 1000 ? `+${(delta / 1000).toFixed(2)}s` : `+${delta}ms`) 
                          : '';
                        
                        const isCriticalLatency = delta !== undefined && delta >= 3000;
                        const isError = step.log.level === 'ERROR';
                        
                        let label = (step.log.service !== '-' ? step.log.service : step.log.className) || '-';
                        // Acortar
                        if (label.length > 32) {
                          label = label.substring(0, 30) + '...';
                        }

                        // Dibujar flecha
                        const isRight = x2 > x1;
                        const isLocal = x1 === x2;

                        let arrowPath = '';
                        let arrowHead = '';

                        if (isLocal) {
                          // Bucle local
                          arrowPath = `M ${x1} ${y} H ${x1 + 50} V ${y + 35} H ${x1 + 10}`;
                          arrowHead = `M ${x1 + 15} ${y + 30} L ${x1} ${y + 35} L ${x1 + 15} ${y + 40}`;
                        } else {
                          arrowPath = `M ${x1} ${y} H ${x2}`;
                          if (isRight) {
                            arrowHead = `M ${x2 - 10} ${y - 5} L ${x2} ${y} L ${x2 - 10} ${y + 5}`;
                          } else {
                            arrowHead = `M ${x2 + 10} ${y - 5} L ${x2} ${y} L ${x2 + 10} ${y + 5}`;
                          }
                        }

                        const classes = ['uml-step-group'];
                        if (isError) classes.push('uml-error');
                        if (isCriticalLatency) classes.push('uml-latency-critical');
                        
                        return (
                          <g 
                            key={idx} 
                            className={classes.join(' ')} 
                            onClick={() => {
                              setActiveLog(step.log);
                              setIsDrawerOpen(true);
                            }}
                          >
                            {/* Hover zone for ease of click */}
                            <rect 
                              x={Math.min(x1, x2) - (isLocal ? 0 : 20)} 
                              y={y - 15} 
                              width={isLocal ? 100 : Math.abs(x2 - x1) + 40} 
                              height={isLocal ? 60 : 40} 
                              fill="transparent" 
                              style={{ cursor: 'pointer' }}
                            />

                            {/* Línea horizontal */}
                            <path 
                              d={arrowPath} 
                              className={`uml-arrow-line ${step.type === 'return' ? 'uml-arrow-return' : 'uml-arrow-call'}`} 
                            />
                            {/* Cabeza de flecha */}
                            <path d={arrowHead} className="uml-arrow-head" />

                            {/* Etiqueta del paso */}
                            <g className="uml-step-label-group">
                              <rect 
                                x={isLocal ? x1 + 8 : Math.min(x1, x2) + Math.abs(x2 - x1) / 2 - 80} 
                                y={y - (isLocal ? 10 : 24)} 
                                width={160} 
                                height={38} 
                                rx={4} 
                                className="uml-step-label-bg" 
                              />
                              <text 
                                x={isLocal ? x1 + 88 : Math.min(x1, x2) + Math.abs(x2 - x1) / 2} 
                                y={y - (isLocal ? -2 : 10)} 
                                className="uml-step-label-text"
                              >
                                #{step.log.id} - {label}
                              </text>
                              <text 
                                x={isLocal ? x1 + 88 : Math.min(x1, x2) + Math.abs(x2 - x1) / 2} 
                                y={y - (isLocal ? -12 : -4)} 
                                className={`uml-step-latency-text ${isCriticalLatency ? 'critical' : ''}`}
                              >
                                {step.log.level} {latencyText && `(${latencyText})`}
                              </text>
                            </g>

                            {/* Icono de advertencia para latencia crítica */}
                            {isCriticalLatency && (
                              <g transform={`translate(${isLocal ? x1 + 55 : (isRight ? x2 - 30 : x2 + 15)}, ${y - 12})`}>
                                <circle cx="8" cy="8" r="8" fill="#ef596f" />
                                <text x="8" y="12" fill="#282c34" fontSize="11" fontWeight="bold" textAnchor="middle">!</text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
      
      <div className="filter-row search-row">
        <div className="search-input-wrapper">
          <span className="material-icons-round search-icon">search</span>
          <input 
            type="text" 
            id="search-input" 
            placeholder="Buscar por método, mensaje, IP, ID de correlación o payload..." 
            value={filters.searchTerm}
            onChange={e => { setFilters(p => ({ ...p, searchTerm: e.target.value })); setCurrentPage(1); }} 
          />
          {filters.searchTerm && (
            <button 
              className="clear-search-btn" 
              onClick={() => { setFilters(p => ({ ...p, searchTerm: '' })); setCurrentPage(1); }}
            >
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>
        <div className="search-options">
          <button 
            className={`option-pill ${filters.isRegexSearch ? 'active' : ''}`} 
            onClick={() => { setFilters(p => ({ ...p, isRegexSearch: !p.isRegexSearch })); setCurrentPage(1); }}
          >
            RegEx
          </button>
          <button 
            className={`option-pill ${filters.isPayloadsOnly ? 'active' : ''}`} 
            onClick={() => { setFilters(p => ({ ...p, isPayloadsOnly: !p.isPayloadsOnly })); setCurrentPage(1); }}
          >
            Con Payloads
          </button>
        </div>
      </div>

      <div className="filter-row qa-quick-row">
        <div className="quick-filters-wrapper">
          <span className="filter-group-label">DIAGNÓSTICO QA:</span>
          <div className="quick-filter-pills">
            {[
              { id: 'NONE', label: 'Todos los Logs', icon: 'clear_all', color: 'gray' },
              { id: 'LATENCY', label: 'Latencia Crítica (>2s)', icon: 'speed', color: 'amber' },
              { id: 'INTEGRATION_ERRORS', label: 'Errores SOAP / Timeout', icon: 'report_problem', color: 'red' },
              { id: 'SOAP_TRAFFIC', label: 'Tráfico SOAP (XML)', icon: 'code', color: 'purple' },
              { id: 'REQUESTS', label: 'Peticiones (REQ)', icon: 'arrow_forward', color: 'blue' },
              { id: 'RESPONSES', label: 'Respuestas (RESP)', icon: 'arrow_back', color: 'green' }
            ].map(pill => {
              const active = (filters.quickFilter || 'NONE') === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  className={`quick-pill-btn qa-pill-${pill.color} ${active ? 'active' : ''}`}
                  onClick={() => {
                    setFilters(p => ({ ...p, quickFilter: pill.id as any }));
                    setCurrentPage(1);
                  }}
                >
                  <span className="material-icons-round pill-icon">{pill.icon}</span>
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="filter-row control-row">
        <div className="level-pills">
          <span className="filter-group-label">NIVEL:</span>
          <button 
            className={`option-pill level-all-pill ${activeLevels.size === availableLevels.length ? 'active' : ''}`}
            onClick={() => { setFilters(p => ({ ...p, activeLevels: new Set(availableLevels) })); setCurrentPage(1); }}
          >
            <span>TODOS</span>
          </button>
          {availableLevels.map(level => {
            const active = activeLevels.has(level);
            const color = getLevelColor(level);
            const activeStyle = active ? {
              backgroundColor: `hsla(${color}, 0.12)`,
              borderColor: `hsl(${color})`,
              color: `hsl(${color})`
            } : {};
            return (
              <button 
                key={level} 
                className={`level-pill level-${level.toLowerCase()}-pill ${active ? 'active' : ''}`}
                style={activeStyle}
                onClick={() => handleLevelClick(level)}
              >
                {level}
              </button>
            );
          })}
        </div>

        <div className="dropdown-filters">
          <SearchableSelect
            options={[
              { value: 'ALL', label: 'Todos los Servicios' },
              ...uniqueServices.map(s => ({ value: s, label: s }))
            ]}
            value={filters.activeService}
            onChange={val => {
              setFilters(p => ({ ...p, activeService: val }));
              setCurrentPage(1);
            }}
            placeholder="Todos los Servicios"
            icon="dns"
          />

          <div className="date-picker-dropdown-wrapper" ref={datePickerRef}>
            {/* Trigger Button */}
            <button
              type="button"
              className={`date-picker-trigger-btn ${filters.dateFrom || filters.dateTo ? 'active' : ''}`}
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            >
              <div className="trigger-btn-content">
                <span className="material-icons-round">calendar_month</span>
                <span className="trigger-btn-label">Rango de tiempo:</span>
                <strong className="trigger-btn-value">{activeDateLabel}</strong>
              </div>
              
              <div className="trigger-btn-actions">
                {(filters.dateFrom || filters.dateTo) && (
                  <span
                    className="material-icons-round clear-date-trigger-icon"
                    title="Restablecer todo el tiempo"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilters(p => ({ ...p, dateFrom: null, dateTo: null }));
                      setCurrentPage(1);
                    }}
                  >
                    cancel
                  </span>
                )}
                <span className="material-icons-round expand-arrow-icon">
                  {isDatePickerOpen ? 'expand_less' : 'expand_more'}
                </span>
              </div>
            </button>

            {/* Glassmorphic Dropdown Popover */}
            {isDatePickerOpen && (
              <div className="date-picker-popover">
                <div className="date-picker-popover-body">
                  {/* Presets Column */}
                  <div className="popover-column presets-column">
                    <span className="popover-section-title">Preajustes</span>
                    <div className="preset-buttons-grid">
                      <button
                        type="button"
                        className="preset-pill-btn"
                        onClick={() => {
                          applyTimePreset(15);
                          setIsDatePickerOpen(false);
                        }}
                      >
                        Últimos 15 minutos
                      </button>
                      <button
                        type="button"
                        className="preset-pill-btn"
                        onClick={() => {
                          applyTimePreset(60);
                          setIsDatePickerOpen(false);
                        }}
                      >
                        Última hora
                      </button>
                      <button
                        type="button"
                        className="preset-pill-btn"
                        onClick={() => {
                          applyTimePreset(1440);
                          setIsDatePickerOpen(false);
                        }}
                      >
                        Últimas 24 horas
                      </button>
                      <button
                        type="button"
                        className="preset-pill-btn preset-full-pill"
                        onClick={() => {
                          applyFullDateRange();
                          setIsDatePickerOpen(false);
                        }}
                      >
                        Rango Completo
                      </button>
                    </div>
                  </div>
                  {/* Custom Range Column */}
                  <div className="popover-column custom-range-column">
                    <span className="popover-section-title">Rango Personalizado</span>
                    
                    {/* Pestañas de selección de Extremo del Rango */}
                    <div className="calendar-tabs">
                      <button
                        type="button"
                        className={`calendar-tab-btn ${activeTab === 'from' ? 'active' : ''}`}
                        onClick={() => setActiveTab('from')}
                      >
                        <span className="tab-label">Desde:</span>
                        <span className="tab-value">
                          {tempDateFrom ? formatDateShort(tempDateFrom) : 'Inicio'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`calendar-tab-btn ${activeTab === 'to' ? 'active' : ''}`}
                        onClick={() => setActiveTab('to')}
                      >
                        <span className="tab-label">Hasta:</span>
                        <span className="tab-value">
                          {tempDateTo ? formatDateShort(tempDateTo) : 'Ahora'}
                        </span>
                      </button>
                    </div>

                    {/* Widget del Calendario Mensual */}
                    <div className="custom-calendar-widget">
                      <div className="calendar-header">
                        <button type="button" className="calendar-nav-btn" onClick={prevMonth}>
                          <span className="material-icons-round">chevron_left</span>
                        </button>
                        <span className="calendar-month-title">{MONTH_NAMES[month]} {year}</span>
                        <button type="button" className="calendar-nav-btn" onClick={nextMonth}>
                          <span className="material-icons-round">chevron_right</span>
                        </button>
                      </div>

                      <div className="calendar-weekdays">
                        {WEEKDAY_NAMES.map(w => (
                          <span key={w} className="weekday-cell">{w}</span>
                        ))}
                      </div>

                      <div className="calendar-days-grid">
                        {daysArray.map((d, index) => {
                          const cellDate = new Date(d.year, d.month, d.day);

                          const safeTempFrom = getSafeDate(tempDateFrom);
                          const safeTempTo = getSafeDate(tempDateTo);

                          const isSelectedFrom = safeTempFrom && 
                            safeTempFrom.getDate() === d.day && 
                            safeTempFrom.getMonth() === d.month && 
                            safeTempFrom.getFullYear() === d.year;

                          const isSelectedTo = safeTempTo && 
                            safeTempTo.getDate() === d.day && 
                            safeTempTo.getMonth() === d.month && 
                            safeTempTo.getFullYear() === d.year;

                          const isInRange = safeTempFrom && safeTempTo && 
                            cellDate >= new Date(safeTempFrom.getFullYear(), safeTempFrom.getMonth(), safeTempFrom.getDate()) && 
                            cellDate <= new Date(safeTempTo.getFullYear(), safeTempTo.getMonth(), safeTempTo.getDate());

                          const isToday = (() => {
                            const today = new Date();
                            return today.getDate() === d.day && today.getMonth() === d.month && today.getFullYear() === d.year;
                          })();

                          const hasLogsInDay = (() => {
                            const minDate = getSafeDate(logDateRange.min);
                            const maxDate = getSafeDate(logDateRange.max);
                            if (!minDate || !maxDate) return false;
                            const minDay = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
                            const maxDay = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
                            return cellDate >= minDay && cellDate <= maxDay;
                          })();

                          const classes = ['day-cell'];
                          if (!d.isCurrentMonth) classes.push('day-outside');
                          if (isSelectedFrom) classes.push('day-selected-from');
                          if (isSelectedTo) classes.push('day-selected-to');
                          if (isInRange) classes.push('day-in-range');
                          if (isToday) classes.push('day-today');
                          if (hasLogsInDay) classes.push('day-has-logs');

                          return (
                            <button
                              key={index}
                              type="button"
                              className={classes.join(' ')}
                              onClick={() => handleDayClick(d)}
                              title={hasLogsInDay ? "Este día contiene logs de transacciones" : undefined}
                            >
                              <span className="day-number">{d.day}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selector Digital de Tiempo (Hora y Minuto) */}
                    <div className="custom-time-widget">
                      <span className="time-picker-label">
                        Hora {activeTab === 'from' ? 'Inicio' : 'Fin'}:
                      </span>
                      <div className="digital-clock-container">
                        <div className="digital-clock-unit">
                          <button type="button" className="time-arrow-btn" onClick={incrementHours}>
                            <span className="material-icons-round">expand_less</span>
                          </button>
                          <input
                            type="text"
                            className="digital-clock-input"
                            value={String(currentHours).padStart(2, '0')}
                            onChange={e => {
                              const val = Math.min(23, Math.max(0, parseInt(e.target.value) || 0));
                              handleTimeChange(val, currentMinutes);
                            }}
                            maxLength={2}
                          />
                          <button type="button" className="time-arrow-btn" onClick={decrementHours}>
                            <span className="material-icons-round">expand_more</span>
                          </button>
                        </div>

                        <span className="digital-clock-divider">:</span>

                        <div className="digital-clock-unit">
                          <button type="button" className="time-arrow-btn" onClick={incrementMinutes}>
                            <span className="material-icons-round">expand_less</span>
                          </button>
                          <input
                            type="text"
                            className="digital-clock-input"
                            value={String(currentMinutes).padStart(2, '0')}
                            onChange={e => {
                              const val = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                              handleTimeChange(currentHours, val);
                            }}
                            maxLength={2}
                          />
                          <button type="button" className="time-arrow-btn" onClick={decrementMinutes}>
                            <span className="material-icons-round">expand_more</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Botones de acción del Popover */}
                    <div className="calendar-actions-row">
                      <button
                        type="button"
                        className="clear-custom-range-btn"
                        onClick={() => {
                          setTempDateFrom(null);
                          setTempDateTo(null);
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>backspace</span>
                        Limpiar Rango
                      </button>
                      
                      <button
                        type="button"
                        className="apply-custom-range-btn"
                        onClick={() => {
                          setFilters(p => ({ ...p, dateFrom: tempDateFrom, dateTo: tempDateTo }));
                          setCurrentPage(1);
                          setIsDatePickerOpen(false);
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                        Aplicar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Timespan Info */}
                {logDateRange.minStr && (
                  <div className="date-picker-popover-footer">
                    <span className="material-icons-round">info</span>
                    <span>
                      Rango de logs cargados: <strong>{logDateRange.minStr}</strong> a <strong>{logDateRange.maxStr}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <button 
            id="btn-reset-filters" 
            className="secondary-button" 
            onClick={() => { 
              setFilters({ 
                activeLevels: defaultLevels(), 
                activeService: 'ALL', 
                searchTerm: '', 
                isRegexSearch: false, 
                isPayloadsOnly: false, 
                dateFrom: null, 
                dateTo: null, 
                correlationId: null 
              }); 
              setSortColumn(null); 
              setSortDirection('asc'); 
              setCurrentPage(1); 
            }}
          >
            <span className="material-icons-round">restart_alt</span> Reestablecer
          </button>
        </div>
      </div>
    </section>
  );
};
