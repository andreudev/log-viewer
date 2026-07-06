import React, { useState, useEffect } from 'react';
import { LogEntry } from '../../../domain/models/LogEntry';
import { formatPayload } from '../../../domain/formatting/formatPayload';
import { executeReplay, ReplayResponse } from '../../../infrastructure/api/filesApi';

interface RequestReplayProps {
  activeLog: LogEntry;
}

export const RequestReplay: React.FC<RequestReplayProps> = ({ activeLog }) => {
  const [url, setUrl] = useState('http://localhost:8080/services/CapaMedia');
  const [method, setMethod] = useState('POST');
  const [headersText, setHeadersText] = useState('{\n  "Content-Type": "application/json"\n}');
  const [bodyText, setBodyText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Attempt to deduce headers and body from the log entry
  useEffect(() => {
    const payloadInfo = formatPayload(activeLog.message);
    setBodyText(payloadInfo.formatted || activeLog.message);

    // Deduce method
    if (activeLog.level === 'REQ') {
      setMethod('POST');
    } else if (activeLog.level === 'RESP') {
      setMethod('POST'); // standard for SOAP / RPC
    }

    const headers: Record<string, string> = {};
    if (payloadInfo.kind === 'xml') {
      headers['Content-Type'] = 'application/xml; charset=utf-8';
      // Deduce soap action if possible
      const soapActionMatch = activeLog.message.match(/<SOAPAction>([^<]+)<\/SOAPAction>/i) || 
                              activeLog.message.match(/soapaction:\s*"([^"]+)"/i);
      if (soapActionMatch) {
        headers['SOAPAction'] = soapActionMatch[1];
      }
    } else {
      headers['Content-Type'] = 'application/json';
    }

    if (activeLog.correlationId && activeLog.correlationId !== '-') {
      headers['X-Correlation-ID'] = activeLog.correlationId;
    }

    setHeadersText(JSON.stringify(headers, null, 2));

    // Try to deduce URL from className or service if it looks like an absolute URL
    if (activeLog.service && activeLog.service.startsWith('http')) {
      setUrl(activeLog.service);
    } else {
      // Deducing a sensible fallback endpoint base path
      const serviceClean = (activeLog.service || 'Servicio').replace(/[^a-zA-Z0-9]/g, '');
      setUrl(`http://localhost:8080/api/services/${serviceClean}`);
    }

    setResponse(null);
    setError(null);
  }, [activeLog]);

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    try {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(headersText);
      } catch (e: any) {
        throw new Error('Cabeceras inválidas: Asegúrate de ingresar un JSON válido. ' + e.message);
      }

      const res = await executeReplay({
        url,
        method,
        headers,
        body: bodyText
      });
      setResponse(res);
    } catch (err: any) {
      setError(err.message || 'Error desconocido al re-ejecutar petición');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return '#98c379'; // Green
    if (status >= 300 && status < 400) return '#61afef'; // Blue
    if (status >= 400 && status < 500) return '#e5c07b'; // Yellow
    return '#e06c75'; // Red
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px', animation: 'tail-fade-in 0.2s ease-out' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--accent-solid)' }}>swap_calls</span>
          Consola HTTP Replay Engine
        </h4>
        <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
          Envía una llamada HTTP real utilizando el contenido y las cabeceras de este registro.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          style={{
            background: 'var(--bg-input, #282c34)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '12px',
            outline: 'none',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <option value="POST">POST</option>
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:8080/api/endpoint"
          style={{
            flex: 1,
            background: 'var(--bg-input, #282c34)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            outline: 'none',
            fontFamily: 'var(--font-mono)'
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px' }}>CABECERAS (JSON)</span>
          <textarea
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            style={{
              background: 'var(--bg-input, #282c34)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              minHeight: '120px',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.4
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px' }}>CUERPO DE PETICIÓN (RAW)</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            style={{
              background: 'var(--bg-input, #282c34)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              minHeight: '120px',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.4
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSend}
          disabled={loading || !url}
          className="primary-button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            fontSize: '12px'
          }}
        >
          <span className="material-icons-round" style={{ fontSize: '16px' }}>
            {loading ? 'hourglass_top' : 'send'}
          </span>
          {loading ? 'Enviando petición...' : 'Enviar Petición (Replay)'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(224,108,117,0.1)', border: '1px solid rgba(224,108,117,0.2)', borderRadius: '6px', color: '#e06c75', fontSize: '12.5px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span className="material-icons-round" style={{ fontSize: '18px', marginTop: '1px' }}>warning</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontWeight: 600 }}>Error de Ejecución</span>
            <span style={{ opacity: 0.9 }}>{error}</span>
          </div>
        </div>
      )}

      {response && (
        <div 
          style={{ 
            background: 'rgba(0,0,0,0.18)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'tail-fade-in 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span 
                style={{ 
                  background: getStatusColor(response.status) + '22',
                  color: getStatusColor(response.status),
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${getStatusColor(response.status)}44`
                }}
              >
                STATUS {response.status} {response.statusText}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span className="material-icons-round" style={{ fontSize: '13px' }}>schedule</span>
                {response.timeMs}ms
              </span>
            </div>
            
            <button
              onClick={() => {
                navigator.clipboard.writeText(response.body);
                alert('Respuesta copiada al portapapeles');
              }}
              className="secondary-button compact-btn"
              style={{ padding: '3px 8px', fontSize: '10px', height: '22px' }}
            >
              Copiar Respuesta
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', maxHeight: '250px', overflowY: 'auto' }}>
            <div style={{ borderRight: '1px solid var(--border-color)', padding: '10px 14px', background: 'rgba(0,0,0,0.1)' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>RESPONSE HEADERS</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(response.headers).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '9.5px', color: 'var(--accent-solid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={key}>{key}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(val)}>{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>RESPONSE BODY</span>
              <pre 
                style={{ 
                  margin: 0, 
                  fontSize: '11px', 
                  fontFamily: 'var(--font-mono)', 
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.4
                }}
              >
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(response.body), null, 2);
                  } catch {
                    return response.body;
                  }
                })()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
