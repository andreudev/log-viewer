import React from 'react';
import { LogEntry } from '../../../domain/models/LogEntry';

interface UmlDiagramProps {
  filteredLogs: LogEntry[];
  isUmlCollapsed: boolean;
  setIsUmlCollapsed: (collapsed: boolean) => void;
  setActiveLog: (log: LogEntry | null) => void;
  setIsDrawerOpen: (isOpen: boolean) => void;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  correlationId: string;
}

export const UmlDiagram: React.FC<UmlDiagramProps> = ({
  filteredLogs,
  isUmlCollapsed,
  setIsUmlCollapsed,
  setActiveLog,
  setIsDrawerOpen,
  setFilters,
  correlationId
}) => {

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
    <div className="uml-sequence-panel">
      <div className="flow-isolation-banner">
        <div className="banner-left">
          <span className="material-icons-round text-accent">insights</span>
          <span>Aislamiento de Flujo Activo: <code>{correlationId}</code></span>
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
            onClick={() => setFilters((p: any) => ({ ...p, correlationId: null }))}
          >
            <span className="material-icons-round" style={{ fontSize: 16 }}>close</span>
            <span>Restablecer</span>
          </button>
        </div>
      </div>

      {!isUmlCollapsed && (
        <div className="uml-diagram-container">
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
                if (label.length > 32) {
                  label = label.substring(0, 30) + '...';
                }

                const isRight = x2 > x1;
                const isLocal = x1 === x2;

                let arrowPath = '';
                let arrowHead = '';

                if (isLocal) {
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
                    <rect 
                      x={Math.min(x1, x2) - (isLocal ? 0 : 20)} 
                      y={y - 15} 
                      width={isLocal ? 100 : Math.abs(x2 - x1) + 40} 
                      height={isLocal ? 60 : 40} 
                      fill="transparent" 
                      style={{ cursor: 'pointer' }}
                    />

                    <path 
                      d={arrowPath} 
                      className={`uml-arrow-line ${step.type === 'return' ? 'uml-arrow-return' : 'uml-arrow-call'}`} 
                    />
                    <path d={arrowHead} className="uml-arrow-head" />

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
        </div>
      )}
    </div>
  );
};
