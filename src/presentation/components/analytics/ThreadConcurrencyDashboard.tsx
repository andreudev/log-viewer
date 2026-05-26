import React, { useMemo } from 'react';
import { LogEntry } from '../../../domain/models/LogEntry';

interface ThreadConcurrencyDashboardProps {
  parsedLogs: LogEntry[];
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export const ThreadConcurrencyDashboard: React.FC<ThreadConcurrencyDashboardProps> = ({
  parsedLogs,
  setFilters,
  setCurrentPage
}) => {

  const parseTime = (timestampStr: string): Date | null => {
    if (!timestampStr || timestampStr.includes('--')) return null;
    try {
      let t: Date;
      if (/^\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{2}:\d{2}/.test(timestampStr)) {
        t = new Date(timestampStr.replace(',', '.'));
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(timestampStr)) {
        t = new Date(timestampStr);
      } else if (/^\d{1,2}-\d{1,2}-\d{4}\s\d{1,2}:\d{2}:\d{2}/.test(timestampStr)) {
        const match = timestampStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s(.*)/);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const year = match[3];
          const time = match[4];
          t = new Date(`${year}-${month}-${day}T${time}`);
        } else {
          t = new Date(timestampStr);
        }
      } else {
        t = new Date(timestampStr);
      }
      return isNaN(t.getTime()) ? null : t;
    } catch {
      return null;
    }
  };

  // Group and compute thread stats
  const threadStats = useMemo(() => {
    const map = new Map<string, {
      name: string;
      total: number;
      errors: number;
      warns: number;
      reqs: number;
      resps: number;
      minTime: Date | null;
      maxTime: Date | null;
      logs: LogEntry[];
    }>();

    parsedLogs.forEach(log => {
      const thread = log.thread || 'unknown';
      let stats = map.get(thread);
      if (!stats) {
        stats = {
          name: thread,
          total: 0,
          errors: 0,
          warns: 0,
          reqs: 0,
          resps: 0,
          minTime: null,
          maxTime: null,
          logs: []
        };
        map.set(thread, stats);
      }

      stats.total++;
      if (log.level === 'ERROR') stats.errors++;
      else if (log.level === 'WARN') stats.warns++;
      else if (log.level === 'REQ') stats.reqs++;
      else if (log.level === 'RESP') stats.resps++;

      const logTime = parseTime(log.timestamp);
      if (logTime) {
        if (!stats.minTime || logTime < stats.minTime) stats.minTime = logTime;
        if (!stats.maxTime || logTime > stats.maxTime) stats.maxTime = logTime;
      }
      stats.logs.push(log);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [parsedLogs]);

  // Overall time bounds
  const timeBounds = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;

    parsedLogs.forEach(log => {
      const logTime = parseTime(log.timestamp);
      if (logTime) {
        if (!min || logTime < min) min = logTime;
        if (!max || logTime > max) max = logTime;
      }
    });

    return { min, max };
  }, [parsedLogs]);

  const handleThreadClick = (threadName: string) => {
    // Inject filter by thread name in search or custom filter (we can focus search on thread name or filter it)
    setFilters((prev: any) => ({
      ...prev,
      searchTerm: `thread:${threadName}`
    }));
    setCurrentPage(1);
    
    // Switch to feed tab
    const tabBtn = document.querySelector('button.tab-btn');
    if (tabBtn) {
      (tabBtn as HTMLButtonElement).click();
    }
  };

  // Render SVG Swimlanes for top 6 threads
  const topThreads = threadStats.slice(0, 6);
  const svgWidth = 800;
  const svgHeight = topThreads.length * 50 + 40;

  const renderSwimlanes = () => {
    if (topThreads.length === 0 || !timeBounds.min || !timeBounds.max) {
      return (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
          No hay datos de tiempo suficientes para graficar la concurrencia.
        </div>
      );
    }

    const minTs = timeBounds.min.getTime();
    const maxTs = timeBounds.max.getTime();
    const span = maxTs - minTs || 1;

    return (
      <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', overflowX: 'auto' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--accent-solid)' }}>
          Cronología de Concurrencia (Swimlanes de Actividad de Hilos)
        </h4>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height={svgHeight} style={{ overflow: 'visible' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
            const x = 180 + p * (svgWidth - 200);
            const timeLabel = new Date(minTs + p * span).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <g key={idx}>
                <line 
                  x1={x} 
                  y1={10} 
                  x2={x} 
                  y2={svgHeight - 30} 
                  stroke="rgba(255,255,255,0.05)" 
                  strokeDasharray="4 4" 
                />
                <text 
                  x={x} 
                  y={svgHeight - 12} 
                  fill="var(--text-muted, #5c6370)" 
                  fontSize="9px" 
                  textAnchor="middle"
                >
                  {timeLabel}
                </text>
              </g>
            );
          })}

          {/* Swimlanes */}
          {topThreads.map((thread, tidx) => {
            const y = 30 + tidx * 50;
            return (
              <g key={thread.name}>
                {/* Lane separator */}
                <line 
                  x1={10} 
                  y1={y + 25} 
                  x2={svgWidth - 10} 
                  y2={y + 25} 
                  stroke="rgba(255,255,255,0.04)" 
                />

                {/* Thread Name Text */}
                <text 
                  x={10} 
                  y={y + 14} 
                  fill="var(--text-primary)" 
                  fontSize="11.5px" 
                  fontWeight="bold"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleThreadClick(thread.name)}
                >
                  {thread.name.length > 22 ? thread.name.slice(0, 20) + '...' : thread.name}
                </text>
                <text 
                  x={10} 
                  y={y + 25} 
                  fill="var(--text-muted)" 
                  fontSize="9px"
                >
                  {thread.total} logs ({thread.errors} err)
                </text>

                {/* Swimlane background bar */}
                <rect 
                  x={180} 
                  y={y} 
                  width={svgWidth - 200} 
                  height={18} 
                  rx={3} 
                  fill="rgba(255,255,255,0.02)" 
                />

                {/* Log events rendering */}
                {thread.logs.map((log) => {
                  const logTime = parseTime(log.timestamp);
                  if (!logTime) return null;
                  const ratio = (logTime.getTime() - minTs) / span;
                  const x = 180 + ratio * (svgWidth - 200);

                  let color = '#abb2bf'; // default
                  if (log.level === 'ERROR') color = '#e06c75'; // red
                  else if (log.level === 'WARN') color = '#e5c07b'; // yellow
                  else if (log.level === 'REQ') color = '#56b6c2'; // teal
                  else if (log.level === 'RESP') color = '#98c379'; // green

                  return (
                    <circle 
                      key={log.id} 
                      cx={x} 
                      cy={y + 9} 
                      r={4} 
                      fill={color}
                      opacity={0.7}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleThreadClick(thread.name)}
                    >
                      <title>{`Log #${log.id} [${log.level}] ${log.timestamp}\nService: ${log.service}\n${log.message.slice(0, 100)}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'tail-fade-in 0.3s ease-out' }}>
      
      {/* Swimlane diagram */}
      {renderSwimlanes()}

      {/* Grid listing all threads */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
          Métricas y Estadísticas por Hilo de Ejecución
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
          {threadStats.map(thread => {
            const errorRate = thread.total ? ((thread.errors / thread.total) * 100).toFixed(1) : '0';
            const rangeStr = thread.minTime && thread.maxTime 
              ? `${thread.minTime.toLocaleTimeString()} - ${thread.maxTime.toLocaleTimeString()}`
              : 'N/A';

            return (
              <div 
                key={thread.name}
                onClick={() => handleThreadClick(thread.name)}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'transform 0.15s, border-color 0.15s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent-solid)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span 
                    style={{ 
                      fontWeight: 'bold', 
                      fontSize: '12px', 
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '160px'
                    }}
                    title={thread.name}
                  >
                    {thread.name}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Total: <b>{thread.total}</b>
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
                  <span>Rango: {rangeStr}</span>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span style={{ background: 'rgba(97,175,239,0.1)', color: '#61afef', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                    REQ: {thread.reqs}
                  </span>
                  <span style={{ background: 'rgba(152,195,121,0.1)', color: '#98c379', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                    RESP: {thread.resps}
                  </span>
                  <span style={{ background: 'rgba(224,108,117,0.1)', color: '#e06c75', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                    ERR: {thread.errors} ({errorRate}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
