import React, { useState, useMemo, useCallback } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { getLevelColor } from '../utils/constants';
import { formatPayload } from '../../domain/formatting/formatPayload';
import { getSmartDiagnostic } from '../../domain/utils/diagnosticsHelper';
import { AnnotationDetail } from '../hooks/useLogViewerState';

interface NotesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: Record<string, string | AnnotationDetail>;
  setAnnotations: React.Dispatch<React.SetStateAction<Record<string, string | AnnotationDetail>>>;
  parsedLogs: LogEntry[];
  setActiveLog: (log: LogEntry) => void;
  setIsDrawerOpen: (open: boolean) => void;
}

export const NotesManagerModal: React.FC<NotesManagerModalProps> = ({
  isOpen,
  onClose,
  annotations,
  setAnnotations,
  parsedLogs,
  setActiveLog,
  setIsDrawerOpen
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Flatten annotations with key info
  const allNotes = useMemo(() => {
    return Object.keys(annotations).map(key => {
      const ann = annotations[key];
      const isObject = typeof ann === 'object' && ann !== null;
      
      const [originFile, originalIdStr] = key.split('::');
      const originalId = parseInt(originalIdStr, 10);
      
      // Try to find matching log loaded in UI
      const matchingLog = parsedLogs.find(
        l => l.originFile === originFile && (l.originalId === originalId || l.id === originalId)
      );

      return {
        key,
        originFile,
        originalId,
        isLegacy: !isObject,
        text: isObject ? (ann as AnnotationDetail).text : (ann as string),
        timestamp: isObject ? (ann as AnnotationDetail).timestamp : (matchingLog?.timestamp || 'Desconocida'),
        service: isObject ? (ann as AnnotationDetail).service : (matchingLog?.service || '-'),
        level: isObject ? (ann as AnnotationDetail).level : (matchingLog?.level || 'INFO'),
        correlationId: isObject ? (ann as AnnotationDetail).correlationId : (matchingLog?.correlationId || '-'),
        message: isObject ? (ann as AnnotationDetail).message : (matchingLog?.message || ''),
        matchingLog // Active log if loaded
      };
    });
  }, [annotations, parsedLogs]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return allNotes.filter(note => {
      // 1. Search term match
      const query = searchTerm.toLowerCase();
      const matchSearch = 
        note.text.toLowerCase().includes(query) ||
        note.service.toLowerCase().includes(query) ||
        note.correlationId.toLowerCase().includes(query) ||
        note.message.toLowerCase().includes(query) ||
        note.originFile.toLowerCase().includes(query);

      // 2. Level match
      const matchLevel = levelFilter === 'ALL' || note.level === levelFilter;

      return matchSearch && matchLevel;
    });
  }, [allNotes, searchTerm, levelFilter]);

  // Checkbox handlers
  const handleSelectRow = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const visibleKeys = filteredNotes.map(n => n.key);
    const allSelected = visibleKeys.every(k => selectedKeys.has(k));
    
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleKeys.forEach(k => next.delete(k));
      } else {
        visibleKeys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const handleNavigateToLog = (note: typeof allNotes[0]) => {
    if (note.matchingLog) {
      setActiveLog(note.matchingLog);
      setIsDrawerOpen(true);
      onClose();
      setTimeout(() => {
        const row = document.getElementById(`log-row-${note.matchingLog!.id}`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    } else {
      alert(`El archivo "${note.originFile}" no está activo en la sesión actual. Cárgalo desde el Explorador de Archivos para navegar al registro.`);
    }
  };

  // Bulk actions
  const handleDeleteSelected = () => {
    if (selectedKeys.size === 0) return;
    if (window.confirm(`¿Estás seguro de que deseas eliminar las ${selectedKeys.size} notas seleccionadas?`)) {
      setAnnotations(prev => {
        const next = { ...prev };
        selectedKeys.forEach(key => {
          delete next[key];
        });
        localStorage.setItem('logAnnotations', JSON.stringify(next));
        return next;
      });
      setSelectedKeys(new Set());
    }
  };

  const triggerDownload = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate combined Markdown report
  const handleCopyCombinedReport = useCallback(() => {
    if (selectedKeys.size === 0) return;
    
    let report = `# 🚨 Reporte Consolidado de Incidencias — LogScope\n`;
    report += `*Fecha de Generación: ${new Date().toLocaleString()}*\n`;
    report += `*Notas Consolidadas: ${selectedKeys.size}*\n\n`;
    report += `---\n\n`;

    const keysArray = Array.from(selectedKeys);
    keysArray.forEach((key, index) => {
      const note = allNotes.find(n => n.key === key);
      if (!note) return;

      report += `### 📌 Registro #${index + 1}: Log ID ${note.matchingLog ? note.matchingLog.id : note.originalId}\n`;
      report += `- **Nivel:** \`${note.level}\`\n`;
      report += `- **Marca de Tiempo:** ${note.timestamp}\n`;
      report += `- **Servicio/Método:** \`${note.service}\`\n`;
      report += `- **ID Correlación:** \`${note.correlationId}\`\n`;
      report += `- **Origen de Archivo:** \`${note.originFile}\`\n\n`;
      
      report += `#### 📝 Notas del Analista:\n> ${note.text}\n\n`;

      // Incorporar diagnóstico inteligente si existe el mensaje
      if (note.message) {
        const smartDiag = getSmartDiagnostic({ message: note.message } as any);
        if (smartDiag) {
          report += `#### 💡 Diagnóstico y Recomendaciones (LogScope Heuristics):\n`;
          report += `- **Falla Identificada:** ${smartDiag.title}\n`;
          report += `- **Causa Probable:** ${smartDiag.reason}\n`;
          report += `- **Recomendación:** ${smartDiag.suggestion}\n\n`;
        }

        const payloadInfo = formatPayload(note.message);
        const codeBlock = payloadInfo.formatted 
          ? `\`\`\`${payloadInfo.kind === 'xml' ? 'xml' : 'json'}\n${payloadInfo.formatted}\n\`\`\`` 
          : `\`\`\`text\n${note.message}\n\`\`\``;
        report += `#### ⚡ Detalle / Payload:\n${codeBlock}\n\n`;
      }
      report += `---\n\n`;
    });

    report += `*Reporte consolidado generado automáticamente por LogScope Analyzer*`;

    navigator.clipboard.writeText(report).then(() => {
      alert('¡Reporte combinado copiado al portapapeles con éxito!');
    }).catch(err => {
      console.error('Error al copiar al portapapeles:', err);
      alert('Error al copiar el reporte.');
    });
  }, [selectedKeys, allNotes]);

  const handleDownloadCombinedReport = useCallback(() => {
    if (selectedKeys.size === 0) return;
    
    let report = `# 🚨 Reporte Consolidado de Incidencias — LogScope\n`;
    report += `*Fecha de Generación: ${new Date().toLocaleString()}*\n`;
    report += `*Notas Consolidadas: ${selectedKeys.size}*\n\n`;
    report += `---\n\n`;

    const keysArray = Array.from(selectedKeys);
    keysArray.forEach((key, index) => {
      const note = allNotes.find(n => n.key === key);
      if (!note) return;

      report += `### 📌 Registro #${index + 1}: Log ID ${note.matchingLog ? note.matchingLog.id : note.originalId}\n`;
      report += `- **Nivel:** \`${note.level}\`\n`;
      report += `- **Marca de Tiempo:** ${note.timestamp}\n`;
      report += `- **Servicio/Método:** \`${note.service}\`\n`;
      report += `- **ID Correlación:** \`${note.correlationId}\`\n`;
      report += `- **Origen de Archivo:** \`${note.originFile}\`\n\n`;
      
      report += `#### 📝 Notas del Analista:\n> ${note.text}\n\n`;

      if (note.message) {
        const smartDiag = getSmartDiagnostic({ message: note.message } as any);
        if (smartDiag) {
          report += `#### 💡 Diagnóstico y Recomendaciones (LogScope Heuristics):\n`;
          report += `- **Falla Identificada:** ${smartDiag.title}\n`;
          report += `- **Causa Probable:** ${smartDiag.reason}\n`;
          report += `- **Recomendación:** ${smartDiag.suggestion}\n\n`;
        }

        const payloadInfo = formatPayload(note.message);
        const codeBlock = payloadInfo.formatted 
          ? `\`\`\`${payloadInfo.kind === 'xml' ? 'xml' : 'json'}\n${payloadInfo.formatted}\n\`\`\`` 
          : `\`\`\`text\n${note.message}\n\`\`\``;
        report += `#### ⚡ Detalle / Payload:\n${codeBlock}\n\n`;
      }
      report += `---\n\n`;
    });

    report += `*Reporte consolidado generado automáticamente por LogScope Analyzer*`;

    triggerDownload(report, `reporte_consolidado_logs_${Date.now()}.md`, 'text/markdown');
  }, [selectedKeys, allNotes]);

  const handleExportJSON = () => {
    if (selectedKeys.size === 0) return;
    const exportData: Record<string, string | AnnotationDetail> = {};
    selectedKeys.forEach(key => {
      exportData[key] = annotations[key];
    });
    triggerDownload(
      JSON.stringify(exportData, null, 2),
      `log_notes_export_${Date.now()}.json`,
      'application/json'
    );
  };

  const handleExportHTML = useCallback(() => {
    if (selectedKeys.size === 0) return;

    const keysArray = Array.from(selectedKeys);
    const selectedNotes = keysArray.map(k => allNotes.find(n => n.key === k)).filter(Boolean) as typeof allNotes;

    const levelCounts: Record<string, number> = {};
    selectedNotes.forEach(n => {
      levelCounts[n.level] = (levelCounts[n.level] || 0) + 1;
    });

    const getLevelHex = (level: string): string => {
      const map: Record<string, string> = {
        ERROR: '#e06c75', WARN: '#e5c07b', INFO: '#98c379',
        DEBUG: '#61afef', TRACE: '#abb2bf', REQ: '#56b6c2', RESP: '#d19a66'
      };
      return map[level.toUpperCase()] || '#abb2bf';
    };

    const escapeHtml = (str: string): string =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const summaryItems = Object.entries(levelCounts)
      .map(([lvl, count]) =>
        `<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:${getLevelHex(lvl)};"></span><span>${lvl}</span><strong>${count}</strong></div>`
      ).join('');

    let cardsHtml = '';
    selectedNotes.forEach((note, index) => {
      const levelColor = getLevelHex(note.level);

      let diagHtml = '';
      if (note.message) {
        const smartDiag = getSmartDiagnostic({ message: note.message, level: note.level } as any);
        if (smartDiag) {
          const sevColor = smartDiag.severity === 'danger' ? '#e06c75' : smartDiag.severity === 'warning' ? '#e5c07b' : '#61afef';
          diagHtml = `
            <div style="background:rgba(0,0,0,0.2);border-left:3px solid ${sevColor};padding:10px 14px;border-radius:0 6px 6px 0;margin-top:8px;">
              <div style="font-weight:600;color:${sevColor};font-size:13px;margin-bottom:4px;">💡 ${escapeHtml(smartDiag.title)}</div>
              <div style="font-size:12px;color:#a6adc8;margin-bottom:4px;">${escapeHtml(smartDiag.description)}</div>
              <div style="font-size:12px;color:#cdd6f4;"><strong>Recomendación:</strong> ${escapeHtml(smartDiag.recommendation)}</div>
            </div>`;
        }
      }

      let payloadHtml = '';
      if (note.message) {
        const payloadInfo = formatPayload(note.message);
        const displayContent = payloadInfo.formatted || note.message;
        payloadHtml = `
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;font-size:12px;color:#89b4fa;user-select:none;padding:4px 0;">⚡ Ver Payload / Detalle</summary>
            <pre style="background:#11111b;color:#a6adc8;padding:12px;border-radius:6px;overflow-x:auto;font-size:11px;margin-top:6px;white-space:pre-wrap;word-break:break-all;">${escapeHtml(displayContent)}</pre>
          </details>`;
      }

      cardsHtml += `
        <div style="background:#181825;border:1px solid #313244;border-radius:10px;padding:16px 18px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <span style="background:${levelColor}22;color:${levelColor};font-size:10px;font-weight:700;padding:3px 10px;border-radius:4px;text-transform:uppercase;">${escapeHtml(note.level)}</span>
            <span style="font-size:12px;color:#6c7086;font-family:monospace;">#${index + 1}</span>
            <span style="font-size:11px;color:#a6adc8;font-family:monospace;">${escapeHtml(note.timestamp)}</span>
            <span style="font-size:11px;color:#cdd6f4;font-weight:500;">${escapeHtml(note.service !== '-' ? note.service : 'N/A')}</span>
          </div>
          ${note.correlationId && note.correlationId !== '-' ? `<div style="font-size:10px;color:#6c7086;margin-bottom:8px;">Correlación: <code style="background:#11111b;padding:2px 6px;border-radius:3px;color:#89b4fa;">${escapeHtml(note.correlationId)}</code></div>` : ''}
          <div style="background:rgba(229,192,123,0.06);border-left:3px solid #e5c07b;padding:10px 14px;border-radius:0 6px 6px 0;font-size:13px;color:#cdd6f4;font-style:italic;white-space:pre-wrap;">${escapeHtml(note.text)}</div>
          ${diagHtml}
          ${payloadHtml}
        </div>`;
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte LogScope — ${new Date().toLocaleDateString()}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1e2e; color: #cdd6f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; line-height: 1.6; }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #313244; }
  .header h1 { font-size: 24px; color: #cdd6f4; margin-bottom: 4px; }
  .header .brand { color: #e5c07b; font-weight: 700; }
  .header .meta { font-size: 12px; color: #6c7086; margin-top: 6px; }
  .summary { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 28px; padding: 16px; background: #181825; border-radius: 10px; border: 1px solid #313244; }
  .summary > div { font-size: 13px; color: #a6adc8; gap: 6px; }
  .summary strong { color: #cdd6f4; }
  .total { text-align: center; font-size: 14px; color: #a6adc8; margin-bottom: 20px; }
  .total strong { color: #e5c07b; font-size: 20px; }
  .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #313244; font-size: 11px; color: #6c7086; }
  code { font-family: 'Fira Code', 'Cascadia Code', monospace; }
  details summary:hover { color: #b4befe; }
  @media print {
    body { background: #fff; color: #1e1e2e; padding: 16px; }
    .header h1 { color: #1e1e2e; }
    .summary, div[style*="background:#181825"] { background: #f5f5f5 !important; border-color: #ddd !important; }
    pre { background: #f5f5f5 !important; color: #1e1e2e !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>📊 Reporte de Incidencias — <span class="brand">LogScope</span></h1>
    <div class="meta">Generado: ${new Date().toLocaleString()} • Notas exportadas: ${selectedNotes.length}</div>
  </div>
  <div class="total">Total de Notas: <strong>${selectedNotes.length}</strong></div>
  <div class="summary">${summaryItems}</div>
  ${cardsHtml}
  <div class="footer">Reporte generado automáticamente por LogScope Analyzer</div>
</body>
</html>`;

    triggerDownload(html, `reporte_logscope_${Date.now()}.html`, 'text/html');
  }, [selectedKeys, allNotes]);

  const handlePrintPDF = useCallback(() => {
    if (selectedKeys.size === 0) return;

    const keysArray = Array.from(selectedKeys);
    const selectedNotes = keysArray.map(k => allNotes.find(n => n.key === k)).filter(Boolean) as typeof allNotes;

    const getLevelHex = (level: string): string => {
      const map: Record<string, string> = {
        ERROR: '#c0392b', WARN: '#d4a017', INFO: '#27ae60',
        DEBUG: '#2980b9', TRACE: '#7f8c8d', REQ: '#16a085', RESP: '#d35400'
      };
      return map[level.toUpperCase()] || '#7f8c8d';
    };

    const escapeHtml = (str: string): string =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let cardsHtml = '';
    selectedNotes.forEach((note, index) => {
      const levelColor = getLevelHex(note.level);

      let diagHtml = '';
      if (note.message) {
        const smartDiag = getSmartDiagnostic({ message: note.message, level: note.level } as any);
        if (smartDiag) {
          diagHtml = `
            <div style="border-left:3px solid ${levelColor};padding:8px 12px;margin-top:8px;background:#f9f9f9;border-radius:0 4px 4px 0;">
              <div style="font-weight:600;color:${levelColor};font-size:12px;">💡 ${escapeHtml(smartDiag.title)}</div>
              <div style="font-size:11px;color:#555;margin-top:2px;">${escapeHtml(smartDiag.description)}</div>
              <div style="font-size:11px;color:#333;margin-top:2px;"><strong>Recomendación:</strong> ${escapeHtml(smartDiag.recommendation)}</div>
            </div>`;
        }
      }

      let payloadHtml = '';
      if (note.message) {
        const payloadInfo = formatPayload(note.message);
        const displayContent = payloadInfo.formatted || note.message;
        payloadHtml = `<pre style="background:#f4f4f4;color:#333;padding:8px;border-radius:4px;font-size:10px;margin-top:8px;white-space:pre-wrap;word-break:break-all;overflow:hidden;">${escapeHtml(displayContent)}</pre>`;
      }

      cardsHtml += `
        <div style="border:1px solid #ddd;border-radius:6px;padding:12px 14px;margin-bottom:10px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <span style="background:${levelColor};color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;">${escapeHtml(note.level)}</span>
            <span style="font-size:11px;color:#888;font-family:monospace;">#${index + 1}</span>
            <span style="font-size:11px;color:#555;font-family:monospace;">${escapeHtml(note.timestamp)}</span>
            <span style="font-size:11px;color:#333;font-weight:500;">${escapeHtml(note.service !== '-' ? note.service : 'N/A')}</span>
          </div>
          ${note.correlationId && note.correlationId !== '-' ? `<div style="font-size:10px;color:#888;margin-bottom:6px;">Correlación: <code style="background:#eee;padding:1px 4px;border-radius:2px;">${escapeHtml(note.correlationId)}</code></div>` : ''}
          <div style="border-left:3px solid #e5c07b;padding:8px 12px;background:#fffdf5;border-radius:0 4px 4px 0;font-size:12px;color:#333;font-style:italic;white-space:pre-wrap;">${escapeHtml(note.text)}</div>
          ${diagHtml}
          ${payloadHtml}
        </div>`;
    });

    const printHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte LogScope — Impresión</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fff; color: #1e1e1e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; line-height: 1.5; }
  .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5c07b; }
  .header h1 { font-size: 20px; color: #1e1e1e; }
  .header .meta { font-size: 11px; color: #888; margin-top: 4px; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>📊 Reporte de Incidencias — LogScope</h1>
    <div class="meta">Generado: ${new Date().toLocaleString()} • Notas: ${selectedNotes.length}</div>
  </div>
  ${cardsHtml}
  <div style="text-align:center;margin-top:20px;font-size:10px;color:#aaa;border-top:1px solid #ddd;padding-top:10px;">Reporte generado por LogScope Analyzer</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }, [selectedKeys, allNotes]);

  const isAllSelected = filteredNotes.length > 0 && filteredNotes.every(n => selectedKeys.has(n.key));

  if (!isOpen) return null;

  return (
    <div className="compare-modal-overlay" style={{ zIndex: 260 }} onClick={onClose}>
      <div 
        className="compare-modal" 
        style={{ 
          maxWidth: '850px', 
          maxHeight: '650px', 
          height: '80vh',
          width: '95vw',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="material-icons-round" style={{ color: '#e5c07b' }}>note_alt</span>
            <h2>Gestor de Notas del Analista ({allNotes.length})</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Cerrar Notas">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Filters and search panel */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', background: 'var(--bg-app)' }}>
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <span className="material-icons-round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '18px' }}>search</span>
            <input 
              type="text" 
              placeholder="Buscar por notas, servicios, payloads..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '8px 12px 8px 36px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '12px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', 'ERROR', 'WARN', 'INFO', 'REQ', 'RESP'].map(lvl => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                style={{
                  padding: '5px 10px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid ' + (levelFilter === lvl ? 'var(--accent-solid)' : 'var(--border-color)'),
                  background: levelFilter === lvl ? 'var(--accent-bg)' : 'transparent',
                  color: levelFilter === lvl ? 'var(--accent-solid)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {lvl === 'ALL' ? 'Todos' : lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk Action Bar (Visible only when rows are checked) */}
        {selectedKeys.size > 0 && (
          <div style={{
            background: 'rgba(229, 192, 123, 0.08)',
            borderBottom: '1px solid rgba(229, 192, 123, 0.2)',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '12px', color: '#e5c07b', fontWeight: 600 }}>
              {selectedKeys.size} notas seleccionadas
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleCopyCombinedReport}
                className="secondary-button compact-btn"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title="Unificar reportes de notas seleccionadas en el portapapeles"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>content_copy</span>
                Copiar Reporte Combinado
              </button>
              <button 
                onClick={handleDownloadCombinedReport}
                className="secondary-button compact-btn"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title="Descargar reporte combinado en formato Markdown (.md)"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>download</span>
                Descargar .md
              </button>
              <button 
                onClick={handleExportJSON}
                className="secondary-button compact-btn"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title="Exportar notas a archivo JSON estructurado"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>settings_ethernet</span>
                Exportar JSON
              </button>
              <button 
                onClick={handleExportHTML}
                className="secondary-button compact-btn"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title="Generar reporte HTML interactivo y autónomo"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>code</span>
                Exportar HTML
              </button>
              <button 
                onClick={handlePrintPDF}
                className="secondary-button compact-btn"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title="Imprimir reporte para guardar como PDF"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>print</span>
                Imprimir PDF
              </button>
              <button 
                onClick={handleDeleteSelected}
                className="secondary-button compact-btn"
                style={{ background: 'rgba(224,108,117,0.1)', color: '#e06c75', border: '1px solid rgba(224,108,117,0.2)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title="Eliminar notas permanentemente"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>delete</span>
                Eliminar
              </button>
            </div>
          </div>
        )}

        {/* Modal List Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredNotes.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border-color)', borderRadius: '8px', margin: 'auto 0' }}>
              <span className="material-icons-round" style={{ fontSize: '40px', opacity: 0.3, marginBottom: '8px', display: 'block' }}>note_alt</span>
              {allNotes.length === 0 
                ? 'No tienes ninguna nota guardada. Haz anotaciones en los registros de interés para verlas aquí.' 
                : 'Ninguna nota coincide con tus filtros o término de búsqueda.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Select All Checkbox Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 14px', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)' }}>
                <label className="custom-checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                  />
                </label>
                <span style={{ cursor: 'pointer', fontWeight: 600 }} onClick={handleSelectAll}>
                  Seleccionar Todas ({filteredNotes.length})
                </span>
              </div>

              {/* Notes List */}
              {filteredNotes.map(note => {
                const lc = getLevelColor(note.level);
                const hasMatchingLog = !!note.matchingLog;
                const isSelected = selectedKeys.has(note.key);

                return (
                  <div
                    key={note.key}
                    style={{
                      background: isSelected ? 'rgba(229, 192, 123, 0.03)' : 'rgba(255,255,255,0.01)',
                      border: '1px solid ' + (isSelected ? 'rgba(229, 192, 123, 0.3)' : 'var(--border-color)'),
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Row Checkbox */}
                    <label className="custom-checkbox-container" style={{ marginTop: '4px' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => handleSelectRow(note.key)}
                      />
                    </label>

                    {/* Content Section */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span 
                          style={{ 
                            background: `hsla(${lc}, 0.12)`, 
                            color: `hsl(${lc})`,
                            fontSize: '9.5px',
                            fontWeight: 'bold',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase'
                          }}
                        >
                          {note.level}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {note.timestamp}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {note.service !== '-' ? note.service : `Log #${note.originalId}`}
                        </span>
                        {note.originFile && (
                          <span 
                            style={{ 
                              fontSize: '9px', 
                              color: 'var(--text-muted)',
                              background: 'rgba(255,255,255,0.05)',
                              padding: '1px 5px',
                              borderRadius: '3px'
                            }}
                            title={note.originFile}
                          >
                            {note.originFile}
                          </span>
                        )}
                      </div>

                      {/* Log Note text (The most important part) */}
                      <div style={{
                        background: 'rgba(229, 192, 123, 0.05)',
                        borderLeft: '3px solid #e5c07b',
                        padding: '8px 12px',
                        borderRadius: '0 6px 6px 0',
                        fontSize: '12.5px',
                        color: 'var(--text-primary)',
                        fontStyle: 'italic',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {note.text}
                      </div>

                      {/* Original message snippet */}
                      {note.message && (
                        <div 
                          style={{ 
                            fontSize: '11px', 
                            color: 'var(--text-secondary)', 
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            background: 'rgba(0,0,0,0.15)',
                            padding: '4px 8px',
                            borderRadius: '4px'
                          }}
                          title={note.message}
                        >
                          {note.message}
                        </div>
                      )}
                    </div>

                    {/* Nav and Delete buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, alignSelf: 'center' }}>
                      <button 
                        className="icon-button"
                        onClick={() => handleNavigateToLog(note)}
                        disabled={!hasMatchingLog}
                        title={hasMatchingLog ? "Ir al registro en la tabla" : "Archivo origen no cargado"}
                        style={{ 
                          background: hasMatchingLog ? 'rgba(255,255,255,0.05)' : 'transparent',
                          opacity: hasMatchingLog ? 1 : 0.25,
                          borderRadius: '6px'
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_forward</span>
                      </button>
                      <button 
                        className="icon-button"
                        onClick={() => {
                          setAnnotations(prev => {
                            const next = { ...prev };
                            delete next[note.key];
                            localStorage.setItem('logAnnotations', JSON.stringify(next));
                            return next;
                          });
                          setSelectedKeys(prev => {
                            const next = new Set(prev);
                            next.delete(note.key);
                            return next;
                          });
                        }}
                        title="Eliminar nota"
                        style={{ background: 'rgba(224,108,117,0.08)', color: '#e06c75', borderRadius: '6px' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            LogScope Gestor de Notas • v15.0
          </span>
          <button className="secondary-button" onClick={onClose} style={{ padding: '8px 16px' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
