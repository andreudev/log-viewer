import { useMemo, useState } from 'react';
import { LogEntry, LogLevel } from '../../domain/models/LogEntry';
import { ThreadConcurrencyDashboard } from './analytics/ThreadConcurrencyDashboard';

interface AnalyticsDashboardProps {
  logs: LogEntry[];
  onSelectCorrelationId: (cid: string) => void;
  onSelectService: (service: string) => void;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export function AnalyticsDashboard({ 
  logs, 
  onSelectCorrelationId, 
  onSelectService,
  setFilters,
  setCurrentPage
}: AnalyticsDashboardProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'threads'>('metrics');

  // 1. Core Metrics
  const stats = useMemo(() => {
    let total = logs.length;
    let errors = 0;
    let warnings = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    let maxLatency = 0;

    logs.forEach(l => {
      if (l.level === 'ERROR') errors++;
      if (l.level === 'WARN') warnings++;
      if (l.deltaTimeMs !== undefined) {
        totalLatency += l.deltaTimeMs;
        latencyCount++;
        if (l.deltaTimeMs > maxLatency) maxLatency = l.deltaTimeMs;
      }
    });

    return {
      total,
      errors,
      warnings,
      errorRate: total ? ((errors / total) * 100).toFixed(1) : '0.0',
      avgLatency: latencyCount ? Math.round(totalLatency / latencyCount) : 0,
      maxLatency,
      latencyCount
    };
  }, [logs]);

  // 2. Latency Histogram Ranges
  // Ranges: < 100ms, 100ms-500ms, 500ms-1s, 1s-3s, 3s-5s, > 5s
  const histogramData = useMemo(() => {
    const buckets = [
      { label: '< 100ms', min: 0, max: 100, count: 0 },
      { label: '100 - 500ms', min: 100, max: 500, count: 0 },
      { label: '500ms - 1s', min: 500, max: 1000, count: 0 },
      { label: '1s - 3s', min: 1000, max: 3000, count: 0 },
      { label: '3s - 5s', min: 3000, max: 5000, count: 0 },
      { label: '> 5s', min: 5000, max: Infinity, count: 0 }
    ];

    logs.forEach(l => {
      if (l.deltaTimeMs !== undefined) {
        const d = l.deltaTimeMs;
        for (const b of buckets) {
          if (d >= b.min && d < b.max) {
            b.count++;
            break;
          }
        }
      }
    });

    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    return buckets.map((b, idx) => ({
      ...b,
      percentage: (b.count / maxCount) * 100,
      totalPercentage: stats.latencyCount ? ((b.count / stats.latencyCount) * 100).toFixed(1) : '0'
    }));
  }, [logs, stats.latencyCount]);

  // 3. Error Dispersion by Service
  const errorServices = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(l => {
      if (l.level === 'ERROR' && l.service && l.service !== '-') {
        counts[l.service] = (counts[l.service] || 0) + 1;
      }
    });

    const sorted = Object.entries(counts)
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count);

    const totalErrors = stats.errors || 1;
    let accumulated = 0;

    const items = sorted.map((item, index) => {
      const percentage = (item.count / totalErrors) * 100;
      const startAngle = (accumulated / totalErrors) * 360;
      accumulated += item.count;
      return {
        ...item,
        percentage,
        startAngle,
        color: `hsl(${(index * 65) % 360}, 55%, 55%)`
      };
    });

    return items;
  }, [logs, stats.errors]);

  // 4. Critical Latency Incidents (Deltas > 3s)
  const slowTransactions = useMemo(() => {
    return logs
      .filter(l => l.deltaTimeMs !== undefined && l.deltaTimeMs > 3000)
      .sort((a, b) => (b.deltaTimeMs || 0) - (a.deltaTimeMs || 0))
      .slice(0, 5);
  }, [logs]);

  // 4b. Average response time / latency by service
  const serviceLatencies = useMemo(() => {
    const data: Record<string, { total: number; count: number }> = {};
    logs.forEach(l => {
      if (l.deltaTimeMs !== undefined && l.service && l.service !== '-') {
        if (!data[l.service]) {
          data[l.service] = { total: 0, count: 0 };
        }
        data[l.service].total += l.deltaTimeMs;
        data[l.service].count++;
      }
    });

    const items = Object.entries(data)
      .map(([service, val]) => ({
        service,
        avg: Math.round(val.total / val.count),
        count: val.count
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6);

    const maxAvg = Math.max(...items.map(i => i.avg), 1);
    return items.map(item => ({
      ...item,
      percentage: (item.avg / maxAvg) * 100
    }));
  }, [logs]);

  // 5. CSV Raw Auditor Exporter
  const handleExportCSV = () => {
    const headers = [
      'ID Registro',
      'Marca de Tiempo',
      'Nivel',
      'Servicio / Metodo',
      'ID Correlacion',
      'Clase Origen',
      'Hilo',
      'Delta Latencia (ms)',
      'Archivo Origen',
      'Mensaje (Snippet)'
    ];

    const rows = logs.map(l => {
      const msgSnippet = l.message.replace(/\r?\n/g, ' ').replace(/"/g, '""').slice(0, 150);
      return [
        l.id,
        l.timestamp,
        l.level,
        l.service,
        l.correlationId,
        l.className,
        l.thread,
        l.deltaTimeMs !== undefined ? l.deltaTimeMs : '',
        l.originFile || '',
        `"${msgSnippet}"`
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `auditoria_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Panel Analítico de Salud y Rendimiento</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Métricas de transacciones y diagnóstico de tiempos de respuesta del API Gateway.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="primary-button compact-btn" onClick={handleExportCSV}>
            <span className="material-icons-round">download</span> Exportar Auditoría CSV
          </button>
          <button 
            className="secondary-button compact-btn" 
            onClick={() => window.print()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '30px',
              padding: '0 12px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <span className="material-icons-round">picture_as_pdf</span> Exportar Reporte PDF
          </button>
        </div>
      </div>

      {/* Tab Selectors (v15.0) */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px', gap: '8px' }}>
        <button 
          className={`tab-btn`}
          onClick={() => setActiveTab('metrics')}
          style={{
            padding: '8px 16px',
            fontSize: '12.5px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'metrics' ? '2px solid var(--accent-solid)' : '2px solid transparent',
            color: activeTab === 'metrics' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s'
          }}
        >
          Métricas de Salud del Sistema
        </button>
        <button 
          className={`tab-btn`}
          onClick={() => setActiveTab('threads')}
          style={{
            padding: '8px 16px',
            fontSize: '12.5px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'threads' ? '2px solid var(--accent-solid)' : '2px solid transparent',
            color: activeTab === 'threads' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s'
          }}
        >
          Actividad y Concurrencia de Hilos (Timeline)
        </button>
      </div>

      {activeTab === 'threads' ? (
        <ThreadConcurrencyDashboard 
          parsedLogs={logs} 
          setFilters={setFilters} 
          setCurrentPage={setCurrentPage} 
        />
      ) : (
        <>
          {/* Grid de KPIs Secundarios */}
          <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
            <div className="kpi-card gradient-blue" style={{ padding: '16px' }}>
              <div className="card-icon"><span className="material-icons-round">bolt</span></div>
              <div className="card-info">
                <span className="card-label">Latencia Promedio</span>
                <h2>{stats.avgLatency} ms</h2>
                <span className="card-subtext">Basado en {stats.latencyCount} flujos correlacionados</span>
              </div>
            </div>
            <div className="kpi-card gradient-red" style={{ padding: '16px' }}>
              <div className="card-icon"><span className="material-icons-round">trending_up</span></div>
              <div className="card-info">
                <span className="card-label">Tasa de Error QA</span>
                <h2>{stats.errorRate}%</h2>
                <span className="card-subtext">{stats.errors} excepciones de {stats.total} logs</span>
              </div>
            </div>
            <div className="kpi-card gradient-yellow" style={{ padding: '16px' }}>
              <div className="card-icon"><span className="material-icons-round">speed</span></div>
              <div className="card-info">
                <span className="card-label">Latencia Máxima</span>
                <h2>{(stats.maxLatency / 1000).toFixed(2)} s</h2>
                <span className="card-subtext">Pico crítico detectado</span>
              </div>
            </div>
          </div>

          <div className="analytics-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Histograma de Latencias */}
            <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>DISTRIBUCIÓN DE LATENCIA (Deltas)</span>
                <span className="badge badge-outline" style={{ fontSize: '10px' }}>Histograma de Frecuencia</span>
              </div>
              {stats.latencyCount === 0 ? (
                <div className="zero-state" style={{ height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--text-muted)', marginBottom: '8px' }}>insights</span>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Cargue logs con IDs de correlación para analizar latencias.</p>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {/* Native interactive SVG bar chart */}
                  <svg width="100%" height="220" viewBox="0 0 500 220" preserveAspectRatio="none">
                    {/* Gridlines */}
                    {[0, 25, 50, 75, 100].map((val) => (
                      <line 
                        key={val} 
                        x1="40" 
                        y1={180 - val * 1.5} 
                        x2="480" 
                        y2={180 - val * 1.5} 
                        stroke="var(--border-color)" 
                        strokeWidth="0.5" 
                        strokeDasharray="4 4" 
                      />
                    ))}
                    {/* Bars */}
                    {histogramData.map((b, idx) => {
                      const barWidth = 50;
                      const gap = 15;
                      const x = 50 + idx * (barWidth + gap);
                      const barHeight = b.percentage * 1.4; // Scale to fit nicely
                      const y = 180 - barHeight;
                      const isHovered = hoveredBar === idx;
                      
                      return (
                        <g key={idx}>
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx="3"
                            fill={isHovered ? 'var(--accent-solid)' : 'var(--accent-bg)'}
                            stroke={isHovered ? 'var(--accent-solid)' : 'rgba(99, 102, 241, 0.4)'}
                            strokeWidth="1.5"
                            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                            onMouseEnter={() => setHoveredBar(idx)}
                            onMouseLeave={() => setHoveredBar(null)}
                          />
                          {/* Label on top of bar when hovered */}
                          {isHovered && (
                            <text
                              x={x + barWidth / 2}
                              y={y - 6}
                              textAnchor="middle"
                              fill="var(--text-primary)"
                              fontSize="10"
                              fontWeight="bold"
                            >
                              {b.count} ({b.totalPercentage}%)
                            </text>
                          )}
                          {/* X Axis Labels */}
                          <text
                            x={x + barWidth / 2}
                            y="198"
                            textAnchor="middle"
                            fill="var(--text-muted)"
                            fontSize="9.5"
                            fontWeight="500"
                          >
                            {b.label}
                          </text>
                        </g>
                      );
                    })}
                    {/* X-Axis line */}
                    <line x1="40" y1="180" x2="480" y2="180" stroke="var(--border-color)" strokeWidth="1.5" />
                  </svg>
                </div>
              )}
            </div>

            {/* Distribución de Errores por Servicio */}
            <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>EXCEPCIONES POR SERVICIO / MÉTODO</span>
                <span className="badge badge-outline" style={{ fontSize: '10px' }}>Dispersión QA</span>
              </div>
              {stats.errors === 0 ? (
                <div className="zero-state" style={{ height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--text-muted)', marginBottom: '8px' }}>check_circle_outline</span>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>¡Fabuloso! No se han detectado logs con errores.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', height: '220px' }}>
                  {/* Donut Chart SVG */}
                  <div style={{ width: '160px', height: '160px', flexShrink: 0, position: 'relative' }}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--border-color)" strokeWidth="10" />
                      {/* Arc segments using dasharray */}
                      {(() => {
                        let accumulatedPercent = 0;
                        return errorServices.map((es, idx) => {
                          const circumference = 2 * Math.PI * 40; // ~251.327
                          const strokeDash = (es.count / stats.errors) * circumference;
                          const strokeOffset = circumference - strokeDash + (accumulatedPercent / stats.errors) * circumference;
                          accumulatedPercent += es.count;
                          const isHovered = hoveredSegment === es.service;
                          
                          return (
                            <circle
                              key={idx}
                              cx="50"
                              cy="50"
                              r="40"
                              fill="transparent"
                              stroke={es.color}
                              strokeWidth={isHovered ? 13 : 10}
                              strokeDasharray={`${strokeDash} ${circumference}`}
                              strokeDashoffset={-strokeOffset}
                              transform="rotate(-90 50 50)"
                              style={{ 
                                cursor: 'pointer', 
                                transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                                opacity: hoveredSegment === null || isHovered ? 1 : 0.65 
                              }}
                              onMouseEnter={() => setHoveredSegment(es.service)}
                              onMouseLeave={() => setHoveredSegment(null)}
                            />
                          );
                        });
                      })()}
                    </svg>
                    {/* Center Value */}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.errors}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Errores</div>
                    </div>
                  </div>

                  {/* Legend with interactive highlight */}
                  <div className="donut-legend" style={{ flex: 1, overflowY: 'auto', maxHeight: '180px', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                    {errorServices.slice(0, 6).map((es, idx) => {
                      const isHovered = hoveredSegment === es.service;
                      return (
                        <div 
                          key={idx}
                          className={`legend-row ${isHovered ? 'active' : ''}`}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            padding: '4px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: isHovered ? 'var(--bg-panel-hover)' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={() => setHoveredSegment(es.service)}
                          onMouseLeave={() => setHoveredSegment(null)}
                          onClick={() => onSelectService(es.service)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: es.color, flexShrink: 0 }}></div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={es.service}>
                              {es.service}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginLeft: '8px', flexShrink: 0 }}>
                            {es.count} ({es.percentage.toFixed(0)}%)
                          </span>
                        </div>
                      );
                    })}
                    {errorServices.length > 6 && (
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
                        + {errorServices.length - 6} servicios más
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Latencia Promedio por Servicio */}
            <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>LATENCIA PROMEDIO POR SERVICIO</span>
                <span className="badge badge-outline" style={{ fontSize: '10px' }}>Rendimiento (ms)</span>
              </div>
              {serviceLatencies.length === 0 ? (
                <div className="zero-state" style={{ height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--text-muted)', marginBottom: '8px' }}>speed</span>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Cargue logs con deltas de tiempo para analizar latencias por servicio.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '220px', justifyContent: 'center' }}>
                  {serviceLatencies.map((sl, idx) => (
                    <div 
                      key={idx} 
                      style={{ display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer' }}
                      onClick={() => onSelectService(sl.service)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={sl.service}>{sl.service}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sl.avg} ms <span style={{ fontSize: '9px', fontWeight: 'normal', color: 'var(--text-muted)' }}>({sl.count} reqs)</span></span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <div 
                          style={{ 
                            width: `${sl.percentage}%`, 
                            height: '100%', 
                            background: `linear-gradient(90deg, var(--accent-bg) 0%, var(--accent-solid) 100%)`,
                            borderRadius: '4px',
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Latencias Críticas (> 3000ms) */}
          <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>TRANSACCIONES CRÍTICAS LENTAS (&gt; 3.0s)</span>
              <span className="badge badge-outline" style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>Alerta de Latencia</span>
            </div>
            {slowTransactions.length === 0 ? (
              <div className="zero-state" style={{ height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--text-muted)', marginRight: '8px' }}>celebration</span>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Excelente: No hay transacciones individuales que superen los 3.0 segundos.</p>
              </div>
            ) : (
              <div className="slow-transactions-table-wrapper" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Registro ID</th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Marca de Tiempo</th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Servicio / Método</th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>ID de Correlación</th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Latencia Delta</th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slowTransactions.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s ease' }} className="slow-row-hover">
                        <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text-primary)' }}>#{t.id}</td>
                        <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{t.timestamp}</td>
                        <td style={{ padding: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.service}</td>
                        <td style={{ padding: '10px' }}><span className="badge badge-correlation" style={{ margin: 0 }}>{t.correlationId}</span></td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                          +{(t.deltaTimeMs! / 1000).toFixed(2)} s
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <button 
                            className="secondary-button compact-btn" 
                            title="Aislar flujo en la tabla de logs"
                            onClick={() => onSelectCorrelationId(t.correlationId)}
                          >
                            <span className="material-icons-round" style={{ fontSize: 13, marginRight: 2 }}>insights</span> Aislar Flujo
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
