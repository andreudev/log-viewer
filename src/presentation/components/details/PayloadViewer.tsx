import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry } from '../../../domain/models/LogEntry';
import { formatPayload } from '../../../domain/formatting/formatPayload';
import { highlightJson } from '../../../domain/formatting/highlightJson';
import { highlightXml } from '../../../domain/formatting/highlightXml';
import { highlightHtmlText } from '../../../domain/formatting/highlightHtmlText';
import { escapeHtml } from '../../utils/helpers';
import { ExporterButtons } from './ExporterButtons';
import { XPathConsole } from './XPathConsole';

interface PayloadViewerProps {
  activeLog: LogEntry;
  searchTerm: string;
  isRegexSearch: boolean;
  copyText: (text: string) => Promise<void>;
  isDrawerOpen: boolean;
}

export const PayloadViewer: React.FC<PayloadViewerProps> = ({
  activeLog,
  searchTerm,
  isRegexSearch,
  copyText,
  isDrawerOpen
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [localCopySuccess, setLocalCopySuccess] = useState<'formatted' | 'minified' | null>(null);

  // Reiniciar estados de búsqueda y copia al cambiar el log activo
  useEffect(() => {
    setLocalSearchQuery('');
    setActiveMatchIndex(0);
    setLocalCopySuccess(null);
  }, [activeLog]);

  // Scroll automático y suave a la coincidencia activa en el payload
  useEffect(() => {
    if (localSearchQuery && isDrawerOpen) {
      const timer = setTimeout(() => {
        const activeElem = document.querySelector('.formatted-box .highlight-active');
        if (activeElem) {
          activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeMatchIndex, localSearchQuery, isDrawerOpen, activeLog]);

  const copyMinifiedPayload = useCallback((formattedText: string, kind: 'json' | 'xml') => {
    try {
      let minified = '';
      if (kind === 'json') {
        minified = JSON.stringify(JSON.parse(formattedText));
      } else {
        minified = formattedText.replace(/>\s+</g, '><').replace(/\r?\n|\r/g, '').trim();
      }
      copyText(minified);
      setLocalCopySuccess('minified');
      setTimeout(() => setLocalCopySuccess(null), 2000);
    } catch (e) {
      const fallback = formattedText.replace(/\s+/g, ' ').trim();
      copyText(fallback);
      setLocalCopySuccess('minified');
      setTimeout(() => setLocalCopySuccess(null), 2000);
    }
  }, [copyText]);

  const payload = formatPayload(activeLog.message);
  if (payload.kind === 'none') return null;

  let payloadContent = payload.kind === 'xml' 
    ? highlightXml(payload.formatted || '') 
    : highlightJson(payload.formatted || '');
  
  // 1. Aplicar búsqueda global del visor si existe
  if (searchTerm) {
    payloadContent = highlightHtmlText(payloadContent, searchTerm, isRegexSearch);
  }

  // 2. Aplicar búsqueda local del drawer e inyectar clase highlight-active de forma precisa
  let totalMatches = 0;
  if (localSearchQuery) {
    // Primero aplicamos el marcado general para la query local
    payloadContent = highlightHtmlText(payloadContent, localSearchQuery, false);

    // Luego contamos y reemplazamos la coincidencia activa con .highlight-active
    let currentMatch = 0;
    payloadContent = payloadContent.replace(/<mark class="highlight-nested">/g, (match) => {
      const idx = currentMatch;
      currentMatch++;
      if (idx === activeMatchIndex) {
        return '<mark class="highlight-nested highlight-active">';
      }
      return match;
    });
    totalMatches = currentMatch;
  }

  const handlePrevMatch = () => {
    if (totalMatches === 0) return;
    setActiveMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches);
  };

  const handleNextMatch = () => {
    if (totalMatches === 0) return;
    setActiveMatchIndex(prev => (prev + 1) % totalMatches);
  };

  return (
    <div className="drawer-payload-section">
      <div className="drawer-section-title payload-header-row">
        <span>{payload.title}</span>
        <div className="payload-copy-actions">
          <button 
            type="button"
            className={`secondary-button copy-btn ${localCopySuccess === 'formatted' ? 'active-success' : ''}`}
            onClick={() => {
              copyText(payload.formatted || '');
              setLocalCopySuccess('formatted');
              setTimeout(() => setLocalCopySuccess(null), 2000);
            }}
            title="Copiar estructurado con saltos de línea"
          >
            <span className="material-icons-round" style={{ fontSize: 13 }}>format_align_left</span>
            <span>{localCopySuccess === 'formatted' ? '¡Copiado!' : 'Copiar Formateado'}</span>
          </button>
          <button 
            type="button"
            className={`secondary-button copy-btn ${localCopySuccess === 'minified' ? 'active-success' : ''}`}
            onClick={() => copyMinifiedPayload(payload.formatted || '', payload.kind)}
            title="Copiar todo en una sola línea (minificado)"
          >
            <span className="material-icons-round" style={{ fontSize: 13 }}>horizontal_rule</span>
            <span>{localCopySuccess === 'minified' ? '¡Copiado!' : 'Copiar en una línea'}</span>
          </button>
        </div>
      </div>

      {/* Suite de QA Avanzada (v5.0) */}
      <ExporterButtons 
        activeLog={activeLog} 
        payloadText={payload.formatted || ''} 
        isXml={payload.kind === 'xml'} 
      />

      {/* Consola de Búsqueda XPath / JSONPath */}
      <XPathConsole 
        activeLog={activeLog} 
        payloadKind={payload.kind} 
        payloadFormatted={payload.formatted || ''} 
      />

      {/* Barra de Búsqueda Local en Payloads */}
      <div className="payload-search-bar">
        <div className="payload-search-form">
          <span className="material-icons-round payload-search-icon">find_in_page</span>
          <input
            type="text"
            className="payload-search-input"
            placeholder="Buscar tags, llaves o valores en payload..."
            value={localSearchQuery}
            onChange={e => {
              setLocalSearchQuery(e.target.value);
              setActiveMatchIndex(0);
            }}
          />
          {localSearchQuery && (
            <div className="payload-search-meta">
              <span className="matches-counter">
                {totalMatches > 0 ? `${activeMatchIndex + 1} / ${totalMatches}` : '0 / 0'}
              </span>
              <button
                type="button"
                className="payload-nav-btn"
                onClick={handlePrevMatch}
                disabled={totalMatches === 0}
                title="Anterior coincidencia"
              >
                <span className="material-icons-round">expand_less</span>
              </button>
              <button
                type="button"
                className="payload-nav-btn"
                onClick={handleNextMatch}
                disabled={totalMatches === 0}
                title="Siguiente coincidencia"
              >
                <span className="material-icons-round">expand_more</span>
              </button>
              <button
                type="button"
                className="payload-search-clear"
                onClick={() => {
                  setLocalSearchQuery('');
                  setActiveMatchIndex(0);
                }}
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {payload.prefix && <div className="payload-prefix">{escapeHtml(payload.prefix)}</div>}
      <pre className="text-area-box formatted-box" dangerouslySetInnerHTML={{ __html: payloadContent }} />
      {payload.suffix && <div className="payload-suffix">{escapeHtml(payload.suffix)}</div>}
    </div>
  );
};
