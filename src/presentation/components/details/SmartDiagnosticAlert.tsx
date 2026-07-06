import React, { useState } from 'react';
import { SmartDiagnostic } from '../../../domain/utils/diagnosticsHelper';

interface SmartDiagnosticAlertProps {
  diagnostic: SmartDiagnostic;
  copyText: (text: string) => Promise<void>;
  logInfo: {
    id: number;
    level: string;
    timestamp: string;
    service: string;
    correlationId: string;
  };
}

export const SmartDiagnosticAlert: React.FC<SmartDiagnosticAlertProps> = ({
  diagnostic,
  copyText,
  logInfo
}) => {
  const [copied, setCopied] = useState(false);

  const handleExportDiagnostic = () => {
    const text = `### 🧠 Diagnóstico Inteligente de Error - LogScope
- **Registro:** #${logInfo.id} [${logInfo.level}]
- **Servicio:** ${logInfo.service}
- **ID Correlación:** ${logInfo.correlationId}
- **Fecha:** ${logInfo.timestamp}

#### 🔍 Diagnóstico:
**${diagnostic.title}**
${diagnostic.description}

#### 🛠️ Recomendación Recomendada:
${diagnostic.recommendation}

---
*Generado automáticamente por el motor de heurísticas de LogScope*`;

    copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDanger = diagnostic.severity === 'danger';

  return (
    <div 
      className="smart-diagnostic-box" 
      style={{
        background: isDanger ? 'rgba(224, 108, 117, 0.08)' : 'rgba(229, 192, 123, 0.08)',
        border: `1px solid ${isDanger ? 'rgba(224, 108, 117, 0.25)' : 'rgba(229, 192, 123, 0.25)'}`,
        borderRadius: '8px',
        padding: '16px',
        margin: '16px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        animation: 'tail-fade-in 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span 
            className="material-icons-round" 
            style={{ 
              color: isDanger ? 'var(--color-error, #e06c75)' : 'var(--color-warning, #e5c07b)',
              fontSize: '22px'
            }}
          >
            psychology
          </span>
          <span 
            style={{ 
              fontWeight: 600, 
              fontSize: '13.5px',
              color: isDanger ? 'var(--color-error, #e06c75)' : 'var(--color-warning, #e5c07b)'
            }}
          >
            Diagnóstico de Error LogScope
          </span>
        </div>
        
        <button
          onClick={handleExportDiagnostic}
          className="secondary-button compact-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            height: '24px',
            background: 'rgba(255,255,255,0.03)'
          }}
          title="Copiar informe de diagnóstico en Markdown"
        >
          <span className="material-icons-round" style={{ fontSize: '13px' }}>
            {copied ? 'done' : 'content_copy'}
          </span>
          <span>{copied ? '¡Copiado!' : 'Copiar Diagnóstico'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
          {diagnostic.title}
        </h4>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {diagnostic.description}
        </p>
      </div>

      <div 
        style={{ 
          background: 'rgba(0, 0, 0, 0.25)', 
          padding: '12px 14px', 
          borderRadius: '6px',
          borderLeft: `3px solid ${isDanger ? '#e06c75' : '#e5c07b'}`
        }}
      >
        <span 
          style={{ 
            display: 'block', 
            fontSize: '10.5px', 
            color: 'var(--text-muted)', 
            fontWeight: 700, 
            marginBottom: '6px',
            letterSpacing: '0.5px'
          }}
        >
          ACCIÓN O RESOLUCIÓN RECOMENDADA
        </span>
        <div 
          style={{ 
            fontSize: '11.5px', 
            color: 'var(--text-primary)', 
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
            fontFamily: 'inherit'
          }}
        >
          {diagnostic.recommendation}
        </div>
      </div>
    </div>
  );
};
