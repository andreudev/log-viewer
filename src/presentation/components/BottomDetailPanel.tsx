import React, { useState, useMemo } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { getLevelColor } from '../utils/constants';

interface BottomDetailPanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeLog: LogEntry | null;
  height?: number;
  onResize?: (newHeight: number) => void;
}

/**
 * Split-bottom detail panel. Replaces the old right-side drawer with a
 * much simpler vertical layout that shows ONLY the important log fields
 * (timestamp, level, thread, class, service, correlationId, endpoint,
 * message, raw). If `raw` is JSON, we also format it below.
 *
 * No annotation/AI/compare/replay/etc. — those features were removed
 * from the detail view per user request.
 */
export const BottomDetailPanel: React.FC<BottomDetailPanelProps> = ({
  isOpen,
  setIsOpen,
  activeLog,
  height = 320,
  onResize,
}) => {
  const [copied, setCopied] = useState<'fields' | 'raw' | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(true);

  const formattedJson = useMemo(() => {
    if (!activeLog?.raw) return null;
    const trimmed = activeLog.raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      const obj = JSON.parse(trimmed);
      return JSON.stringify(obj, null, 2);
    } catch {
      return null;
    }
  }, [activeLog?.raw]);

  if (!isOpen || !activeLog) return null;

  const levelColor = getLevelColor(activeLog.level);

  const copyAllFields = async () => {
    const lines = [
      `Timestamp: ${activeLog.timestamp}`,
      `Level:     ${activeLog.level}`,
      `Thread:    ${activeLog.thread}`,
      `Class:     ${activeLog.className}`,
      `Service:   ${activeLog.service}`,
      `Peticion:  ${activeLog.correlationId}`,
      `Endpoint:  ${activeLog.endpoint || '-'}`,
      ``,
      `Message:`,
      activeLog.message,
      ``,
      `Raw:`,
      activeLog.raw || '',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied('fields');
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  };

  const copyRaw = async () => {
    if (!activeLog.raw) return;
    try {
      await navigator.clipboard.writeText(activeLog.raw);
      setCopied('raw');
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="bottom-detail-panel"
      style={{
        height: `${height}px`,
        borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary, rgba(20, 20, 25, 0.6))',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Resize handle (top edge) */}
      <div
        className="bottom-detail-resize-handle"
        style={{
          height: '4px',
          cursor: 'row-resize',
          background: 'transparent',
          flexShrink: 0,
        }}
        onMouseDown={(e) => {
          if (!onResize) return;
          e.preventDefault();
          const startY = e.clientY;
          const startHeight = height;
          const onMove = (ev: MouseEvent) => {
            // Drag up = grow panel (since top edge)
            const delta = startY - ev.clientY;
            const next = Math.max(120, Math.min(800, startHeight + delta));
            onResize(next);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        title="Arrastrar para redimensionar"
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            className="material-icons-round"
            style={{ fontSize: '16px', color: 'var(--text-secondary)' }}
          >
            segment
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>
            Detalle del log
          </span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 600,
              color: '#fff',
              background: levelColor,
            }}
          >
            {activeLog.level}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {activeLog.timestamp}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={copyAllFields}
            title="Copiar todos los campos al portapapeles"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '26px',
              padding: '0 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              background: copied === 'fields' ? 'rgba(80, 200, 120, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: copied === 'fields' ? '#50c878' : 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '13px' }}>
              {copied === 'fields' ? 'check' : 'content_copy'}
            </span>
            {copied === 'fields' ? 'Copiado' : 'Copiar campos'}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            title="Cerrar"
            className="icon-button"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <span className="material-icons-round" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 14px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '12px',
        }}
      >
        <DetailField label="Timestamp" value={activeLog.timestamp} />
        <DetailField label="Level" value={activeLog.level} accent={levelColor} />
        <DetailField label="Thread" value={activeLog.thread} />
        <DetailField label="Class" value={activeLog.className} />
        <DetailField label="Service" value={activeLog.service} />
        <DetailField label="Peticion ID" value={activeLog.correlationId} />
        <DetailField label="Endpoint" value={activeLog.endpoint || '-'} />

        <div style={{ marginTop: '14px', marginBottom: '4px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          MESSAGE
        </div>
        <pre
          className="long-token-wrap"
          style={{
            margin: 0,
            padding: '10px 12px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
          }}
        >
          {activeLog.message || '(empty)'}
        </pre>

        {activeLog.raw && (
          <>
            <div
              style={{
                marginTop: '14px',
                marginBottom: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                RAW {formattedJson ? '(JSON formateado)' : ''}
              </span>
              <button
                onClick={copyRaw}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '22px',
                  padding: '0 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 500,
                  background: copied === 'raw' ? 'rgba(80, 200, 120, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: copied === 'raw' ? '#50c878' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '12px' }}>
                  {copied === 'raw' ? 'check' : 'content_copy'}
                </span>
                {copied === 'raw' ? 'Copiado' : 'Copiar raw'}
              </button>
            </div>
            <pre
              className="long-token-wrap"
              style={{
                margin: 0,
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: formattedJson ? '#9ec1ff' : 'var(--text-primary)',
              }}
            >
              {formattedJson || activeLog.raw}
            </pre>
          </>
        )}

        {activeLog.exception && (
          <>
            <div
              style={{
                marginTop: '14px',
                marginBottom: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                onClick={() => setExceptionOpen(v => !v)}
                title="Expandir/contraer stacktrace"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: '#e06c75',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                <span
                  className="material-icons-round"
                  style={{
                    fontSize: '14px',
                    transform: exceptionOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  chevron_right
                </span>
                EXCEPCIÓN
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '11px' }}>
                  ({activeLog.exception.length.toLocaleString()} chars)
                </span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeLog.exception!);
                    setCopied('raw');
                    setTimeout(() => setCopied(null), 1500);
                  } catch { /* noop */ }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '22px',
                  padding: '0 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 500,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '12px' }}>
                  content_copy
                </span>
                Copiar
              </button>
            </div>
            {exceptionOpen && (
              <pre
                className="long-token-wrap"
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  background: 'rgba(224, 108, 117, 0.06)',
                  border: '1px solid rgba(224, 108, 117, 0.25)',
                  borderRadius: '6px',
                  color: '#ffb3b3',
                  maxHeight: '320px',
                  overflow: 'auto',
                  fontSize: '11px',
                  lineHeight: 1.4,
                }}
              >
                {activeLog.exception}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const DetailField: React.FC<{ label: string; value: string; accent?: string }> = ({
  label,
  value,
  accent,
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '120px 1fr',
      gap: '8px',
      padding: '3px 0',
      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
      overflowWrap: 'anywhere',
    }}
  >
    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase' }}>
      {label}
    </span>
    <span
      style={{
        color: accent || 'var(--text-primary)',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        minWidth: 0,
      }}
    >
      {value || '-'}
    </span>
  </div>
);