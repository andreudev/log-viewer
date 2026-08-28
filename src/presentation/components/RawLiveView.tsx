import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchFileContent } from '../../infrastructure/api/filesApi';
import { connectTail, disconnectTail, TailStatus } from '../../infrastructure/api/tailSocket';

interface RawLiveViewProps {
  /**
   * Selected files in the same format as LogsTable receives.
   *   - Local: "capa-media-logger.log"
   *   - SSH:   "<originId>::capa-media-logger.log"
   */
  selectedFiles: string[];
  /**
   * Called whenever the view's auto-scroll behavior changes (so the
   * caller can render a "follow tail" toggle if it wants to).
   */
  onFollowToggle?: (following: boolean) => void;
}

/**
 * Raw text view of the live log file(s). Unlike `LogsTable`, this does
 * NOT parse each line - it shows the file content as-is in monospace,
 * which is useful to inspect a malformed JSON line, see the exact bytes
 * the server is sending, or copy chunks out for reprocessing.
 *
 * Behavior:
 * 1. On mount: fetch each selected file's full content via REST and
 *    append it (separated by a header comment).
 * 2. Subscribe to the existing tail WebSocket for the SAME files so we
 *    receive new lines as they're appended. Tail lines get a brief
 *    green flash so the user can see them appear.
 * 3. If `selectedFiles` is empty, shows a zero-state.
 */
export const RawLiveView: React.FC<RawLiveViewProps> = ({ selectedFiles, onFollowToggle }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [tailStatus, setTailStatus] = useState<TailStatus | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const newLineCountRef = useRef(0);
  const maxNewLineMarkers = 100;

  // Convert selectedFiles (same format as LogsTable) to {origin, filename} pairs
  const parseKeys = useCallback((keys: string[]) => {
    return keys.map(key => {
      const parts = key.split('::');
      const origin = parts.length > 1 ? parts[0] : 'local';
      const filename = parts.length > 1 ? parts.slice(1).join('::') : key;
      return { key, origin, filename };
    });
  }, []);

  // Load file contents on mount or when selectedFiles changes
  useEffect(() => {
    let cancelled = false;
    const pairs = parseKeys(selectedFiles);

    if (pairs.length === 0) {
      setContent('');
      setError(null);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setError(null);

    (async () => {
      const blocks: string[] = [];
      for (const pair of pairs) {
        try {
          const text = await fetchFileContent(pair.filename, pair.origin);
          const header = pair.origin === 'local'
            ? `===== ${pair.filename} =====`
            : `===== [${pair.origin}] ${pair.filename} =====`;
          // Strip trailing newline since we'll add our own separator
          blocks.push(header + '\n' + text.replace(/\n$/, ''));
        } catch (err: any) {
          const msg = err?.message || `Error leyendo ${pair.filename}`;
          blocks.push(`===== ${pair.filename} =====\n[ERROR: ${msg}]`);
        }
      }
      if (!cancelled) {
        setContent(blocks.join('\n\n') + '\n');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedFiles, parseKeys]);

  // Subscribe to live tail for new lines
  useEffect(() => {
    const pairs = parseKeys(selectedFiles);

    const onLine = (line: string) => {
      setContent(prev => {
        const marker = newLineCountRef.current < maxNewLineMarkers ? '__NEW_LINE__' : '';
        newLineCountRef.current++;
        return prev + line + '\n' + marker;
      });
    };
    const onError = () => {};
    const onStatus = (s: TailStatus) => setTailStatus(s);

    pairs.forEach(p => connectTail(p.filename, onLine, onError, p.origin, onStatus));

    return () => {
      pairs.forEach(p => disconnectTail(p.filename, p.origin));
    };
  }, [selectedFiles, parseKeys]);

  // Auto-scroll to bottom when new content arrives and we're following
  useEffect(() => {
    if (!following || !preRef.current) return;
    const el = preRef.current;
    el.scrollTop = el.scrollHeight;
  }, [content, following]);

  // Clear NEW_LINE markers shortly after content update so the flash
  // animation can run, but the DOM stays clean afterwards.
  useEffect(() => {
    if (newLineCountRef.current === 0) return;
    const t = setTimeout(() => {
      setContent(prev => prev.replace(/__NEW_LINE__\n?/g, ''));
      newLineCountRef.current = 0;
    }, 1200);
    return () => clearTimeout(t);
  }, [content]);

  const toggleFollowing = () => {
    const next = !following;
    setFollowing(next);
    onFollowToggle?.(next);
  };

  // Detect new lines from markers and render them with the flash class
  const renderContent = () => {
    if (loading && !content) return 'Cargando archivo...';
    if (error) return `ERROR: ${error}`;
    if (selectedFiles.length === 0) {
      return 'Ningún archivo seleccionado.\n\nSelecciona un archivo en la barra lateral o divide pantalla para ver el raw en vivo.';
    }
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const isNewMarker = line === '__NEW_LINE__';
      if (isNewMarker) {
        // The next line is the actual new tail line. Mark it.
        return null;
      }
      const isNextNew = lines[idx + 1] === '__NEW_LINE__';
      const display = line.length > 0 ? line : '\u00A0';
      return (
        <span
          key={idx}
          className={`raw-line${isNextNew ? ' raw-line-new' : ''}`}
        >
          {display}
          {'\n'}
        </span>
      );
    });
  };

  const statusLabel = (() => {
    if (!tailStatus) return 'idle';
    if (tailStatus.state === 'open') return 'live';
    if (tailStatus.state === 'connecting') return `connecting (#${tailStatus.attempt})`;
    if (tailStatus.state === 'reconnecting') return `reconnecting (#${tailStatus.attempt})`;
    if (tailStatus.state === 'error') return `error: ${tailStatus.message}`;
    if (tailStatus.state === 'closed') return 'closed';
    return '';
  })();

  const statusColor = (() => {
    if (!tailStatus) return 'var(--text-secondary)';
    if (tailStatus.state === 'open') return '#50c878';
    if (tailStatus.state === 'connecting' || tailStatus.state === 'reconnecting') return '#e5c07b';
    if (tailStatus.state === 'error') return '#e06c75';
    return 'var(--text-secondary)';
  })();

  return (
    <div className="raw-live-view">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 14px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-panel)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Vista Raw</span>
          <span style={{ fontSize: '10px' }}>
            {selectedFiles.length === 0
              ? 'sin archivos'
              : `${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''}`}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: statusColor,
              }}
            />
            tail: {statusLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={toggleFollowing}
            title="Seguir el final del archivo automáticamente al recibir nuevas líneas"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '24px',
              padding: '0 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              background: following ? 'rgba(80, 200, 120, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: following ? '#50c878' : 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '13px' }}>
              {following ? 'vertical_align_bottom' : 'pause'}
            </span>
            {following ? 'Siguiendo' : 'Pausado'}
          </button>
        </div>
      </div>
      <pre ref={preRef} className="raw-pre">
        {renderContent()}
      </pre>
    </div>
  );
};