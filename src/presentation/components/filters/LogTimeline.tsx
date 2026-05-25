import React, { useMemo, useState, useRef } from 'react';
import { FilterState } from '../../../application/usecases/applyFilters';
import { LogEntry } from '../../../domain/models/LogEntry';
import { parseTimestamp } from '../../../domain/parsing/parseTimestamp';

interface LogTimelineProps {
  parsedLogs: LogEntry[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export const LogTimeline: React.FC<LogTimelineProps> = ({
  parsedLogs,
  filters,
  setFilters,
  setCurrentPage
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushCurrent, setBrushCurrent] = useState<number | null>(null);
  const [isBrushing, setIsBrushing] = useState(false);
  const [hoveredBinIdx, setHoveredBinIdx] = useState<number | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    x: number;
    y: number;
    binStart: Date;
    binEnd: Date;
    total: number;
    errors: number;
  } | null>(null);

  // Overall time range based on ALL loaded logs
  const timeRange = useMemo(() => {
    if (parsedLogs.length === 0) return null;
    let minTime = Infinity;
    let maxTime = -Infinity;

    parsedLogs.forEach(log => {
      const d = parseTimestamp(log.timestamp);
      if (d) {
        const t = d.getTime();
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
      }
    });

    if (minTime === Infinity || maxTime === -Infinity || minTime === maxTime) {
      return null;
    }
    return { min: minTime, max: maxTime, delta: maxTime - minTime };
  }, [parsedLogs]);

  // Total Bins
  const N = 40;

  // Compute Bins ignoring dateFrom / dateTo
  const bins = useMemo(() => {
    if (!timeRange) return [];
    const binWidth = timeRange.delta / N;
    
    const tempBins = Array.from({ length: N }, (_, i) => ({
      startTime: new Date(timeRange.min + i * binWidth),
      endTime: new Date(timeRange.min + (i + 1) * binWidth),
      totalCount: 0,
      errorCount: 0
    }));

    // Filter logs with current active rules (ignoring dateFrom/dateTo)
    const activeLevels = filters.activeLevels instanceof Set 
      ? filters.activeLevels 
      : new Set(filters.activeLevels || []);

    const timelineLogs = parsedLogs.filter(log => {
      // 1. Level Filter
      if (activeLevels.size > 0 && !activeLevels.has(log.level)) return false;

      // 2. Service Filter
      if (filters.activeService !== 'ALL' && log.service !== filters.activeService) return false;

      // 3. Correlation ID Filter
      if (filters.correlationId && log.correlationId !== filters.correlationId) return false;

      // 4. Quick Filters
      if (filters.quickFilter && filters.quickFilter !== 'NONE') {
        const msg = log.message || '';
        const msgLower = msg.toLowerCase();
        switch (filters.quickFilter) {
          case 'LATENCY':
            if (log.deltaTimeMs === undefined || log.deltaTimeMs <= 2000) return false;
            break;
          case 'INTEGRATION_ERRORS':
            const isError = log.level === 'ERROR' ||
              msgLower.includes('timeout') ||
              msgLower.includes('connection refused') ||
              msgLower.includes('sockettimeoutexception') ||
              msgLower.includes('exception') ||
              msgLower.includes('http 5') ||
              msgLower.includes('500 internal') ||
              msgLower.includes('error');
            if (!isError) return false;
            break;
          case 'SOAP_TRAFFIC':
            const isSoap = msg.includes('<soapenv:Envelope') ||
              msg.includes('<soap:') ||
              msg.includes('<?xml') ||
              msg.includes('<xml');
            if (!isSoap) return false;
            break;
          case 'REQUESTS':
            const isReq = log.level === 'REQ' || msgLower.includes('request') || msgLower.includes('petición') || msgLower.includes('peticion');
            if (!isReq) return false;
            break;
          case 'RESPONSES':
            const isResp = log.level === 'RESP' || msgLower.includes('response') || msgLower.includes('respuesta');
            if (!isResp) return false;
            break;
        }
      }

      // 5. Payload Filter
      if (filters.isPayloadsOnly) {
        const msg = log.message || '';
        const hasPayload = (msg.includes('{') && msg.includes('}')) || (msg.includes('<') && msg.includes('>'));
        if (!hasPayload) return false;
      }

      // 6. Search Term Filter
      if (filters.searchTerm) {
        if (filters.isRegexSearch) {
          try {
            const regex = new RegExp(filters.searchTerm, 'i');
            if (!regex.test(log.message || '') &&
                !regex.test(log.service || '') &&
                !regex.test(log.correlationId || '') &&
                !regex.test(log.className || '')) {
              return false;
            }
          } catch {
            return true;
          }
        } else {
          const query = filters.searchTerm.toLowerCase();
          if (!(log.message || '').toLowerCase().includes(query) &&
              !(log.service || '').toLowerCase().includes(query) &&
              !(log.correlationId || '').toLowerCase().includes(query) &&
              !(log.className || '').toLowerCase().includes(query)) {
            return false;
          }
        }
      }

      return true;
    });

    // Populate bins
    timelineLogs.forEach(log => {
      const d = parseTimestamp(log.timestamp);
      if (!d) return;
      const t = d.getTime();

      let binIdx = Math.floor((t - timeRange.min) / binWidth);
      if (binIdx < 0) binIdx = 0;
      if (binIdx >= N) binIdx = N - 1;

      tempBins[binIdx].totalCount++;
      if (log.level === 'ERROR') {
        tempBins[binIdx].errorCount++;
      }
    });

    return tempBins;
  }, [parsedLogs, filters, timeRange]);

  const maxCount = useMemo(() => {
    let max = 0;
    bins.forEach(b => {
      if (b.totalCount > max) max = b.totalCount;
    });
    return max || 1;
  }, [bins]);

  // Calculate coordinates of active Date Filter (to dim out-of-filter regions)
  const dimmedRegions = useMemo(() => {
    if (!timeRange) return null;
    const safeDateFrom = filters.dateFrom ? (filters.dateFrom instanceof Date ? filters.dateFrom : new Date(filters.dateFrom)) : null;
    const safeDateTo = filters.dateTo ? (filters.dateTo instanceof Date ? filters.dateTo : new Date(filters.dateTo)) : null;
    
    const validDateFrom = safeDateFrom && !isNaN(safeDateFrom.getTime()) ? safeDateFrom.getTime() : null;
    const validDateTo = safeDateTo && !isNaN(safeDateTo.getTime()) ? safeDateTo.getTime() : null;

    if (!validDateFrom && !validDateTo) return null;

    const startX = validDateFrom ? ((validDateFrom - timeRange.min) / timeRange.delta) * 1000 : 0;
    const endX = validDateTo ? ((validDateTo - timeRange.min) / timeRange.delta) * 1000 : 1000;

    return {
      leftWidth: Math.max(0, startX),
      rightStart: Math.min(1000, endX),
      rightWidth: Math.max(0, 1000 - endX)
    };
  }, [filters.dateFrom, filters.dateTo, timeRange]);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !timeRange) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    setBrushStart(x);
    setBrushCurrent(x);
    setIsBrushing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !timeRange) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;

    if (isBrushing) {
      setBrushCurrent(x);
    }

    const binIdx = Math.floor((x / 1000) * N);
    if (binIdx >= 0 && binIdx < N) {
      setHoveredBinIdx(binIdx);
      const activeBin = bins[binIdx];
      
      // Calculate tooltip position relative to page
      const tooltipX = e.clientX;
      const tooltipY = rect.top - 70; // 70px above timeline container
      
      setTooltipData({
        x: tooltipX,
        y: tooltipY,
        binStart: activeBin.startTime,
        binEnd: activeBin.endTime,
        total: activeBin.totalCount,
        errors: activeBin.errorCount
      });
    } else {
      setHoveredBinIdx(null);
      setTooltipData(null);
    }
  };

  const handleMouseUp = () => {
    if (!isBrushing || brushStart === null || brushCurrent === null || !timeRange || !svgRef.current) {
      setIsBrushing(false);
      return;
    }

    setIsBrushing(false);
    const startX = Math.min(brushStart, brushCurrent);
    const endX = Math.max(brushStart, brushCurrent);

    // Apply filter only if drag was substantial (> 5 units in viewBox space)
    if (endX - startX > 5) {
      const pctStart = Math.max(0, startX / 1000);
      const pctEnd = Math.min(1, endX / 1000);

      const targetStartMs = timeRange.min + pctStart * timeRange.delta;
      const targetEndMs = timeRange.min + pctEnd * timeRange.delta;

      setFilters(prev => ({
        ...prev,
        dateFrom: new Date(targetStartMs),
        dateTo: new Date(targetEndMs)
      }));
      setCurrentPage(1);
    }

    setBrushStart(null);
    setBrushCurrent(null);
  };

  const handleMouseLeave = () => {
    if (isBrushing) {
      handleMouseUp();
    }
    setHoveredBinIdx(null);
    setTooltipData(null);
  };

  const handleDoubleClick = () => {
    setFilters(prev => ({
      ...prev,
      dateFrom: null,
      dateTo: null
    }));
    setCurrentPage(1);
    setBrushStart(null);
    setBrushCurrent(null);
    setIsBrushing(false);
  };

  if (parsedLogs.length === 0 || !timeRange) {
    return (
      <div className="timeline-empty-container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '46px',
        background: 'rgba(0,0,0,0.12)',
        border: '1px dashed var(--border-color)',
        borderRadius: '6px',
        color: 'var(--text-muted)',
        fontSize: '11px',
        margin: '8px 0',
        padding: '0 12px'
      }}>
        <span className="material-icons-round" style={{ fontSize: '14px', marginRight: '6px' }}>insights</span>
        Cargue logs para activar el timeline interactivo de telemetría temporal.
      </div>
    );
  }

  const barWidth = 1000 / N;
  const gap = 2;
  const rectWidth = barWidth - gap;

  // For visual brushes
  const brushRect = isBrushing && brushStart !== null && brushCurrent !== null ? {
    x: Math.min(brushStart, brushCurrent),
    width: Math.abs(brushStart - brushCurrent)
  } : null;

  const pad = (num: number) => String(num).padStart(2, '0');
  const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const formatDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1} ${formatTime(d)}`;

  return (
    <div className="log-timeline-container" style={{
      position: 'relative',
      margin: '6px 0 10px 0',
      background: 'rgba(0,0,0,0.15)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '4px 6px',
      userSelect: 'none'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '9px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginBottom: '2px',
        padding: '0 4px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="material-icons-round" style={{ fontSize: '11px' }}>analytics</span>
          <span>TELEMETRÍA TEMPORAL Y DENSIDAD DE LOGS</span>
        </div>
        <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
          {filters.dateFrom || filters.dateTo ? (
            <span style={{ color: 'var(--accent-solid)', cursor: 'pointer', fontWeight: 600 }} onClick={handleDoubleClick}>
              ✕ Limpiar Zoom (Doble clic)
            </span>
          ) : (
            'Arrastra para hacer zoom (Brush) • Doble clic para reiniciar'
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 1000 65"
        style={{
          width: '100%',
          height: '40px',
          display: 'block',
          cursor: 'crosshair',
          overflow: 'visible'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      >
        {/* Draw active timeline bars */}
        {bins.map((bin, i) => {
          const totalHeight = maxCount > 0 ? (bin.totalCount / maxCount) * 55 : 0;
          const errorHeight = maxCount > 0 ? (bin.errorCount / maxCount) * 55 : 0;
          
          const x = i * barWidth + gap / 2;
          const yTotal = 60 - totalHeight;
          const yError = 60 - errorHeight;

          const isHovered = hoveredBinIdx === i;

          return (
            <g key={i}>
              {/* Total volume bar */}
              <rect
                x={x}
                y={yTotal}
                width={rectWidth}
                height={Math.max(1, totalHeight)}
                rx={1}
                fill={isHovered ? 'var(--text-primary)' : 'rgba(255, 255, 255, 0.12)'}
                style={{ transition: 'fill 0.1s' }}
              />
              {/* Error volume bar */}
              {bin.errorCount > 0 && (
                <rect
                  x={x}
                  y={yError}
                  width={rectWidth}
                  height={Math.max(1, errorHeight)}
                  rx={1}
                  fill={isHovered ? 'rgba(239, 68, 68, 0.95)' : 'rgba(239, 68, 68, 0.5)'}
                  style={{ transition: 'fill 0.1s' }}
                />
              )}
            </g>
          );
        })}

        {/* Shading/Dimming for non-filtered range */}
        {dimmedRegions && (
          <>
            {dimmedRegions.leftWidth > 0 && (
              <rect
                x={0}
                y={0}
                width={dimmedRegions.leftWidth}
                height={60}
                fill="rgba(0, 0, 0, 0.45)"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {dimmedRegions.rightWidth > 0 && (
              <rect
                x={dimmedRegions.rightStart}
                y={0}
                width={dimmedRegions.rightWidth}
                height={60}
                fill="rgba(0, 0, 0, 0.45)"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </>
        )}

        {/* Brush rectangle overlay during selection */}
        {brushRect && (
          <rect
            x={brushRect.x}
            y={0}
            width={brushRect.width}
            height={60}
            fill="rgba(86, 156, 214, 0.22)"
            stroke="var(--accent-solid)"
            strokeWidth={1.5}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Date scale limits */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '7.5px',
        color: 'var(--text-muted)',
        marginTop: '2px',
        padding: '0 2px'
      }}>
        <span>{formatTime(new Date(timeRange.min))}</span>
        <span>{formatTime(new Date(timeRange.min + timeRange.delta / 2))}</span>
        <span>{formatTime(new Date(timeRange.max))}</span>
      </div>

      {/* Custom absolute hover tooltip */}
      {tooltipData && (
        <div style={{
          position: 'fixed',
          left: `${tooltipData.x}px`,
          top: `${tooltipData.y}px`,
          transform: 'translateX(-50%)',
          background: 'rgba(20, 20, 20, 0.92)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
          borderRadius: '6px',
          padding: '6px 8px',
          pointerEvents: 'none',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          fontFamily: 'monospace',
          fontSize: '9.5px',
          color: '#fff',
          whiteSpace: 'nowrap'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '3px', marginBottom: '3px' }}>
            {formatDate(tooltipData.binStart)} ➜ {formatTime(tooltipData.binEnd)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span>Registros:</span>
            <span style={{ fontWeight: 'bold' }}>{tooltipData.total}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: tooltipData.errors > 0 ? '#ef4444' : 'var(--text-muted)' }}>
            <span>Errores (ERROR):</span>
            <span style={{ fontWeight: 'bold' }}>{tooltipData.errors}</span>
          </div>
        </div>
      )}
    </div>
  );
};
