import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LogEntry } from '../../../domain/models/LogEntry';
import { formatPayload } from '../../../domain/formatting/formatPayload';

interface XPathConsoleProps {
  activeLog: LogEntry;
  payloadKind: 'json' | 'xml' | 'none';
  payloadFormatted: string;
}

const getJsonPaths = (obj: any, prefix = '$', depth = 0): string[] => {
  if (depth > 2 || obj === null || typeof obj !== 'object') return [];
  let paths: string[] = [];
  try {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const currentPath = `${prefix}.${key}`;
      paths.push(currentPath);
      if (typeof val === 'object' && val !== null) {
        paths = paths.concat(getJsonPaths(val, currentPath, depth + 1));
      }
    }
  } catch {}
  return paths;
};

const getXmlPaths = (xmlStr: string): string[] => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    const parserError = doc.querySelector('parsererror');
    if (parserError) return [];
    
    const pathsSet = new Set<string>();
    const traverse = (node: Node, currentPath: string) => {
      if (node.nodeType === 1) { // Element Node
        const nodeName = node.nodeName;
        const newPath = currentPath ? `${currentPath}/${nodeName}` : nodeName;
        pathsSet.add(`//${nodeName}`);
        pathsSet.add(`/${newPath}`);
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i], newPath);
        }
      }
    };
    if (doc.documentElement) {
      traverse(doc.documentElement, '');
    }
    return Array.from(pathsSet);
  } catch {
    return [];
  }
};

export const XPathConsole: React.FC<XPathConsoleProps> = ({
  activeLog,
  payloadKind,
  payloadFormatted
}) => {
  const [queryPath, setQueryPath] = useState('');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (!payloadFormatted || payloadKind === 'none') return [];
    if (payloadKind === 'json') {
      try {
        let obj = JSON.parse(payloadFormatted);
        return getJsonPaths(obj).slice(0, 15);
      } catch {
        return [];
      }
    } else if (payloadKind === 'xml') {
      return getXmlPaths(payloadFormatted).slice(0, 15);
    }
    return [];
  }, [payloadFormatted, payloadKind]);

  // Reiniciar consulta al cambiar de log
  useEffect(() => {
    setQueryPath('');
    setQueryResult(null);
    setQueryError(null);
  }, [activeLog]);

  // Resolutor JSONPath Recursivo Nativo
  const evaluateJsonPath = useCallback((obj: any, path: string): any => {
    if (!path || path === '$') return obj;
    let cleanPath = path.startsWith('$.') ? path.slice(2) : (path.startsWith('$') ? path.slice(1) : path);
    if (!cleanPath) return obj;
    
    const parts = cleanPath.split(/\.(?![^\[]*\])/);
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      
      const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const idx = parseInt(arrayMatch[2], 10);
        current = current[key];
        if (Array.isArray(current)) {
          current = current[idx];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }
    return current;
  }, []);

  // Resolutor XPath Nativo
  const evaluateXPath = useCallback((xmlStr: string, xpathExpr: string): string[] => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlStr, "application/xml");
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        return ["XML inválido o con errores de parseo."];
      }
      
      const resolver = (prefix: string) => {
        const nsMap: Record<string, string> = {
          'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
          'soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
          'xsd': 'http://www.w3.org/2001/XMLSchema',
          'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        };
        return nsMap[prefix] || doc.documentElement.namespaceURI || null;
      };
      
      const iterator = doc.evaluate(xpathExpr, doc, resolver, XPathResult.ANY_TYPE, null);
      const results: string[] = [];
      
      if (iterator.resultType === XPathResult.NUMBER_TYPE) {
        return [String(iterator.numberValue)];
      } else if (iterator.resultType === XPathResult.STRING_TYPE) {
        return [iterator.stringValue];
      } else if (iterator.resultType === XPathResult.BOOLEAN_TYPE) {
        return [String(iterator.booleanValue)];
      }
      
      let node = iterator.iterateNext();
      while (node) {
        results.push(node.textContent || node.nodeValue || '');
        node = iterator.iterateNext();
      }
      return results.length > 0 ? results : ["No se encontraron coincidencias para la expresión."];
    } catch (e: any) {
      return [`Error en XPath: ${e.message}`];
    }
  }, []);

  // XPath & JSONPath evaluation logic
  useEffect(() => {
    if (!queryPath || !activeLog || payloadKind === 'none' || !payloadFormatted) {
      setQueryResult(null);
      setQueryError(null);
      return;
    }
    
    try {
      if (payloadKind === 'json') {
        let obj;
        try {
          obj = JSON.parse(payloadFormatted);
        } catch {
          const rawPayloadStr = payloadFormatted.trim();
          obj = new Function(`return ${rawPayloadStr}`)();
        }
        
        const res = evaluateJsonPath(obj, queryPath);
        if (res === undefined) {
          setQueryError("No se encontraron coincidencias para la ruta especificada.");
          setQueryResult(null);
        } else {
          setQueryResult(JSON.stringify(res, null, 2));
          setQueryError(null);
        }
      } else if (payloadKind === 'xml') {
        const resList = evaluateXPath(payloadFormatted, queryPath);
        if (resList.length === 1 && resList[0].startsWith('Error en XPath:')) {
          setQueryError(resList[0]);
          setQueryResult(null);
        } else {
          setQueryResult(resList.join('\n'));
          setQueryError(null);
        }
      }
    } catch (e: any) {
      setQueryError(`Error en consulta: ${e.message}`);
      setQueryResult(null);
    }
  }, [queryPath, activeLog, payloadKind, payloadFormatted, evaluateJsonPath, evaluateXPath]);

  if (payloadKind === 'none') return null;

  return (
    <div className="qa-query-console" style={{ 
      background: 'rgba(30, 34, 42, 0.65)', 
      border: '1px solid var(--border-color)', 
      borderRadius: '8px', 
      padding: '12px',
      marginBottom: '12px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-icons-round" style={{ fontSize: 15 }}>terminal</span>
          Consola {payloadKind === 'xml' ? 'XPath' : 'JSONPath'}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          Ej: {payloadKind === 'xml' ? '//soap:Body' : '$.data.id'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          className="console-query-input"
          placeholder={`Ingresa consulta ${payloadKind === 'xml' ? 'XPath...' : 'JSONPath...'}`}
          value={queryPath}
          onChange={e => setQueryPath(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
        />
        {queryPath && (
          <button 
            type="button" 
            onClick={() => setQueryPath('')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              padding: '0 10px',
              cursor: 'pointer'
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sugerencias de rutas:</span>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxHeight: '52px', overflowY: 'auto', padding: '2px' }}>
            {suggestions.map((path, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setQueryPath(path)}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '3px 8px',
                  fontSize: '9px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--accent-bg)';
                  e.currentTarget.style.borderColor = 'var(--accent-solid)';
                  e.currentTarget.style.color = 'var(--accent-solid)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {path}
              </button>
            ))}
          </div>
        </div>
      )}

      {(queryResult !== null || queryError !== null) && (
        <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
            Resultado de Consulta
          </div>
          {queryError ? (
            <div style={{ fontSize: '11px', color: '#ff6b6b', fontFamily: 'monospace' }}>{queryError}</div>
          ) : (
            <pre style={{ 
              fontSize: '11px', 
              color: '#a6e22e', 
              margin: 0, 
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-all', 
              fontFamily: 'monospace',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>{queryResult}</pre>
          )}
        </div>
      )}
    </div>
  );
};
