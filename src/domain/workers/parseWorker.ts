import { LogEntry } from '../models/LogEntry';
import { ParserConfig } from '../models/ParserConfig';
import { PromotionRule } from '../models/PromotionRule';

// -------------------------------------------------------------
// Utilidades de Parseo Inline para Máximo Rendimiento y Autocontención
// -------------------------------------------------------------

function parseTimestamp(ts: string): Date | null {
  if (!ts || ts.includes('--')) return null;
  try {
    let d: Date;
    
    // Format A: "2026-03-11 16:50:08,501" or "2026-3-11 16:50:08,501"
    if (/^\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{2}:\d{2}/.test(ts)) {
      d = new Date(ts.replace(',', '.'));
    }
    // Format B: "3/10/2026 4:05:24 PM" or "03/10/2026 16:05:24"
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(ts)) {
      d = new Date(ts);
    }
    // Format C: "04-12-2025 08:21:00" or "4-12-2025 8:21:00"
    else if (/^\d{1,2}-\d{1,2}-\d{4}\s\d{1,2}:\d{2}:\d{2}/.test(ts)) {
      const parts = ts.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s(.*)/);
      if (parts) {
        const day = parts[1].padStart(2, '0');
        const month = parts[2].padStart(2, '0');
        const year = parts[3];
        const time = parts[4];
        d = new Date(`${year}-${month}-${day}T${time}`);
      } else {
        d = new Date(ts);
      }
    } else {
      d = new Date(ts);
    }

    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function calculateDeltas(entries: LogEntry[]): LogEntry[] {
  const parsedDates = new Map<number, number>();
  entries.forEach(e => {
    const d = parseTimestamp(e.timestamp);
    if (d) {
      parsedDates.set(e.id, d.getTime());
    }
  });

  const groups = new Map<string, LogEntry[]>();
  entries.forEach(entry => {
    const cid = entry.correlationId;
    if (cid && cid !== '-') {
      if (!groups.has(cid)) {
        groups.set(cid, []);
      }
      groups.get(cid)!.push(entry);
    }
  });

  groups.forEach((groupEntries) => {
    groupEntries.sort((a, b) => {
      const timeA = parsedDates.get(a.id) || 0;
      const timeB = parsedDates.get(b.id) || 0;
      return timeA - timeB;
    });

    for (let i = 1; i < groupEntries.length; i++) {
      const prev = groupEntries[i - 1];
      const curr = groupEntries[i];
      const prevTime = parsedDates.get(prev.id);
      const currTime = parsedDates.get(curr.id);
      if (prevTime !== undefined && currTime !== undefined) {
        curr.deltaTimeMs = currTime - prevTime;
      }
    }
  });

  return entries;
}

// -------------------------------------------------------------
// Hilo Principal del Web Worker
// -------------------------------------------------------------

self.onmessage = async (e: MessageEvent) => {
  const { files, rules, parsers } = e.data as {
    files: { name: string; content: string }[];
    rules: PromotionRule[];
    parsers: ParserConfig[];
  };

  try {
    if (!files || files.length === 0) {
      self.postMessage({ type: 'success', logs: [] });
      return;
    }

    self.postMessage({ type: 'progress', progress: 5, statusText: 'Iniciando el procesamiento...' });

    // 1. Compilar los parsers activos
    const activeParsers = parsers.filter(p => p.enabled);
    const compiledParsers = activeParsers.map(p => {
      try {
        return {
          config: p,
          regex: new RegExp(p.regex)
        };
      } catch (err) {
        console.error(`Expresión regular inválida en el parser "${p.name}":`, err);
        return null;
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    const isNewLog = (line: string): boolean => {
      if (line.trim() === '') return false;
      return compiledParsers.some(cp => cp.regex.test(line));
    };

    let allEntries: LogEntry[] = [];
    let logCounter = 0;

    // Calcular peso total de contenido para feedback de progreso preciso
    const totalBytes = files.reduce((acc, curr) => acc + (curr.content.length || 0), 0);
    let processedBytes = 0;

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      const text = file.content;
      const fileName = file.name;

      self.postMessage({
        type: 'progress',
        progress: Math.min(10 + Math.floor((processedBytes / (totalBytes || 1)) * 60), 70),
        statusText: `Procesando y dividiendo líneas de "${fileName}"...`
      });

      // Dividir el archivo en líneas físicas
      const rawLines = text.split(/\r?\n/);
      const lines: string[] = [];
      let buffer = '';

      const totalLines = rawLines.length;
      let lastProgressTime = Date.now();

      for (let i = 0; i < totalLines; i++) {
        const cleanLine = rawLines[i].replace(/\r$/, '');
        const nextLine = i + 1 < totalLines ? rawLines[i + 1].trim() : '';
        const nextIsNewLog = isNewLog(nextLine);

        // Reconstrucción de líneas de 80 caracteres de SOAP logger
        if (cleanLine.length === 80 && !nextIsNewLog) {
          buffer += cleanLine;
        } else {
          buffer += cleanLine;
          lines.push(buffer);
          buffer = '';
        }

        // Reportar progreso periódico para archivos gigantescos (>50k líneas)
        if (i % 15000 === 0 && Date.now() - lastProgressTime > 150) {
          const fileProg = (i / totalLines) * 20; // 20% del progreso de este archivo
          const ratio = (processedBytes + (i / totalLines) * text.length) / (totalBytes || 1);
          self.postMessage({
            type: 'progress',
            progress: Math.min(10 + Math.floor(ratio * 60), 70),
            statusText: `Líneas analizadas: ${i.toLocaleString()} / ${totalLines.toLocaleString()} en "${fileName}"`
          });
          lastProgressTime = Date.now();
        }
      }
      if (buffer) {
        lines.push(buffer);
      }

      processedBytes += text.length;

      // Parsear las líneas lógicas reconstruidas
      let currentEntry: LogEntry | null = null;
      const fileLinesCount = lines.length;

      for (let i = 0; i < fileLinesCount; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;

        let matched = false;

        for (const cp of compiledParsers) {
          const match = line.match(cp.regex);
          if (match) {
            matched = true;
            if (currentEntry) {
              currentEntry.originFile = fileName;
              currentEntry.originalId = currentEntry.id;
              allEntries.push(currentEntry);
            }

            const config = cp.config;
            const mapping = config.mapping;

            const timestamp = match[mapping.timestamp] || '';
            let level = match[mapping.level] || 'INFO';
            
            if (level.toUpperCase() === 'INPUT') level = 'REQ';
            if (level.toUpperCase() === 'OUTPUT') level = 'RESP';
            level = level.toUpperCase();

            const thread = mapping.thread ? match[mapping.thread] || '-' : '-';
            let className = mapping.className ? match[mapping.className] || '-' : '-';
            let serviceName = mapping.service ? match[mapping.service] || '-' : '-';
            let correlationId = mapping.correlationId ? match[mapping.correlationId] || '-' : '-';
            let message = mapping.message ? match[mapping.message] || '' : '';

            // Regex secundarios
            if (correlationId === '-' && config.correlationIdRegex) {
              const cMatch = message.match(new RegExp(config.correlationIdRegex, 'i'));
              if (cMatch) correlationId = cMatch[1];
            }

            if (className !== '-' && className.includes('.')) {
              if (serviceName === '-') {
                const parts = className.split('.');
                serviceName = parts.pop() || '-';
                className = parts.pop() || className;
              } else {
                className = className.split('.').pop() || className;
              }
            } else if (className === '-' && config.classNameRegex) {
              const clMatch = message.match(new RegExp(config.classNameRegex, 'i'));
              if (clMatch) {
                const clName = clMatch[1];
                className = clName.split('.').pop() || clName;
              }
            }

            if (serviceName === '-' && config.serviceRegex) {
              const sMatch = message.match(new RegExp(config.serviceRegex, 'i'));
              if (sMatch) serviceName = `API Endpoint ${sMatch[1]}`;
            }

            // Normalización formato A
            let finalMessage = message;
            if (config.id === 'format-a') {
              finalMessage = finalMessage
                .replace(/\[\s*Peticion\s+ID:\s*([^\s\]]+)\s*\]/gi, '')
                .replace(/\[\s*Class:\s*([^\s\]]+)\s*\]/gi, '')
                .replace(/\[\s*Endpoint:\s*([^\s\]]+)\s*\]/gi, '')
                .replace(/\[\s*Service\s+Type:\s*([^\s\]]+)\s*\]/gi, '')
                .replace(/^\s*:\s*/, '')
                .trim();

              const urlMatch = finalMessage.match(/(?:URL llamada|URL|GET METHOD):\s*_?https?:\/\/[^\/]+\/(.*)$/i);
              if (urlMatch) {
                const sTypeMatch = message.match(/\[\s*Service\s+Type:\s*([^\s\]]+)\s*\]/i);
                const sType = sTypeMatch ? sTypeMatch[1] : '';
                serviceName = (sType ? `${sType}: ` : '') + urlMatch[1];
              }

              const paramMatch = finalMessage.match(/(?:Parámetros llamada Repositorio|Parámetros petición|Parámetros llamada Repositorio Login|Peticion WS Params):\s*_?(.*)$/i);
              if (paramMatch && serviceName === '-') {
                serviceName = 'API Invocation';
              }
            } else if (config.id === 'format-c') {
              const xmlRootMatch = finalMessage.match(/<([^\s>]+)/);
              if (xmlRootMatch) {
                serviceName = xmlRootMatch[1].replace(/_res$/, '').replace(/&lt;([^\s&>]+)/, '$1');
              }
            }

            // Elevación implícita de severidad
            let finalLevel = level;
            const lowerMsg = finalMessage.toLowerCase();
            const hasErrorKeywords = 
              lowerMsg.includes('[aseoledb]') ||
              lowerMsg.includes('sp_cerror') ||
              (lowerMsg.includes('error:') && !lowerMsg.includes('error: []') && !lowerMsg.includes('error: [ ]')) ||
              lowerMsg.includes('exception') ||
              lowerMsg.includes('timeout') ||
              lowerMsg.includes('cuenta no esta') ||
              lowerMsg.includes('cuenta no está') ||
              lowerMsg.includes('duplicate key') ||
              lowerMsg.includes('codigo>2') ||
              lowerMsg.includes('ocurrio un error') ||
              lowerMsg.includes('ocurrió un error');
            if (hasErrorKeywords) {
              finalLevel = 'ERROR';
            }

            currentEntry = {
              id: ++logCounter,
              timestamp,
              level: finalLevel,
              thread,
              className,
              service: serviceName,
              correlationId,
              message: finalMessage,
              raw: line,
              originFile: fileName,
              originalId: logCounter
            };
            break;
          }
        }

        if (!matched) {
          if (currentEntry && !isNewLog(line)) {
            currentEntry.message += `\n${line}`;
            currentEntry.raw += `\n${line}`;
            continue;
          }

          if (currentEntry) {
            currentEntry.originFile = fileName;
            currentEntry.originalId = currentEntry.id;
            allEntries.push(currentEntry);
          }

          let level = 'INFO';
          let serviceName = '-';
          let timestamp = new Date().toLocaleDateString('es-ES') + ' --';

          const tsMatch = line.match(/^\[?(\d{2}[-/]\d{2}[-/]\d{4}\s\d{2}:\d{2}:\d{2})|^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/);
          if (tsMatch) {
            timestamp = tsMatch[1] || tsMatch[2];
          }

          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('error:') || lowerLine.includes('sp_cerror') || lowerLine.includes('aseoledb') || lowerLine.includes('exception')) {
            level = 'ERROR';
            serviceName = 'DatabaseEngine';
          }

          currentEntry = {
            id: ++logCounter,
            timestamp,
            level,
            thread: 'system',
            className: 'SystemLogger',
            service: serviceName,
            correlationId: '-',
            message: line,
            raw: line,
            originFile: fileName,
            originalId: logCounter
          };
        }
      }

      if (currentEntry) {
        currentEntry.originFile = fileName;
        currentEntry.originalId = currentEntry.id;
        allEntries.push(currentEntry);
      }
    }

    self.postMessage({ type: 'progress', progress: 75, statusText: 'Aplicando reglas de severidad QA...' });

    // 3. Aplicar reglas de promoción
    allEntries.forEach(entry => {
      for (const rule of rules) {
        if (rule.enabled && (entry.message || '').includes(rule.pattern)) {
          entry.level = rule.targetLevel;
          entry.customBadge = rule.customBadge;
          break;
        }
      }
    });

    self.postMessage({ type: 'progress', progress: 85, statusText: 'Ordenando logs cronológicamente...' });

    // 4. Ordenamiento cronológico
    const parsedDates = new Map<number, number>();
    allEntries.forEach((e, idx) => {
      const d = parseTimestamp(e.timestamp);
      if (d) {
        parsedDates.set(idx, d.getTime());
      }
    });

    allEntries.sort((a, b) => {
      const indexA = allEntries.indexOf(a);
      const indexB = allEntries.indexOf(b);
      const timeA = parsedDates.get(indexA) || 0;
      const timeB = parsedDates.get(indexB) || 0;
      if (timeA !== timeB) return timeA - timeB;
      return indexA - indexB;
    });

    // 5. Reasignar IDs globales
    allEntries.forEach((entry, idx) => {
      entry.id = idx + 1;
    });

    self.postMessage({ type: 'progress', progress: 95, statusText: 'Calculando latencias (deltas) de flujos...' });

    // 6. Calcular deltas
    const withDeltas = calculateDeltas(allEntries);

    self.postMessage({ type: 'progress', progress: 100, statusText: 'Procesamiento finalizado exitosamente.' });
    self.postMessage({ type: 'success', logs: withDeltas });
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message || 'Error desconocido procesando logs.' });
  }
};
