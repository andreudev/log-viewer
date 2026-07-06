import { LogEntry, LogLevel } from '../models/LogEntry';
import { ParserConfig, DEFAULT_PARSERS } from '../models/ParserConfig';

export function parseLogs(text: string, parsers: ParserConfig[] = DEFAULT_PARSERS): LogEntry[] {
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];
  let buffer = '';

  // Filtrar y compilar parsers activos
  const activeParsers = parsers.filter(p => p.enabled);
  const compiledParsers = activeParsers.map(p => {
    try {
      return {
        config: p,
        regex: new RegExp(p.regex)
      };
    } catch (e) {
      console.error(`Expresión regular inválida en el parser "${p.name}":`, e);
      return null;
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const isNewLog = (line: string): boolean => {
    if (line.trim() === '') return false;
    return compiledParsers.some(cp => cp.regex.test(line));
  };

  for (let i = 0; i < rawLines.length; i++) {
    const cleanLine = rawLines[i].replace(/\r$/, '');
    const nextLine = i + 1 < rawLines.length ? rawLines[i + 1].trim() : '';
    const nextIsNewLog = isNewLog(nextLine);

    // Reconstruct lines split at exactly 80 characters
    if (cleanLine.length === 80 && !nextIsNewLog) {
      buffer += cleanLine;
    } else {
      buffer += cleanLine;
      lines.push(buffer);
      buffer = '';
    }
  }
  if (buffer) {
    lines.push(buffer);
  }

  const logEntries: LogEntry[] = [];
  let currentEntry: LogEntry | null = null;
  let logCounter = 0;

  for (const line of lines) {
    if (line.trim() === '') continue;

    let matched = false;

    for (const cp of compiledParsers) {
      const match = line.match(cp.regex);
      if (match) {
        matched = true;
        if (currentEntry) logEntries.push(currentEntry);

        const config = cp.config;
        const mapping = config.mapping;

        const timestamp = match[mapping.timestamp] || '';
        let level = match[mapping.level] || 'INFO';
        
        // Mapeo especial para retrocompatibilidad
        if (level.toUpperCase() === 'INPUT') level = 'REQ';
        if (level.toUpperCase() === 'OUTPUT') level = 'RESP';
        level = level.toUpperCase();

        const thread = mapping.thread ? match[mapping.thread] || '-' : '-';
        let className = mapping.className ? match[mapping.className] || '-' : '-';
        let serviceName = mapping.service ? match[mapping.service] || '-' : '-';
        let correlationId = mapping.correlationId ? match[mapping.correlationId] || '-' : '-';
        let message = mapping.message ? match[mapping.message] || '' : '';
        // Numeric endpoint code (e.g. "1015") extracted from `[ Endpoint: 1015 ]`.
        // Kept separate from `service` so the UI can do exact-match filtering.
        let endpointCode: string | undefined;

        // Extracciones secundarias
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
          if (sMatch) {
            endpointCode = sMatch[1];
            // Prefer a short, scannable label for the table
            serviceName = `EP ${endpointCode}`;
          }
        }

        // Limpieza de mensajes para el Formato A (sistema)
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

        // Elevación de nivel por palabras clave críticas de QA
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
          endpoint: endpointCode,
        };
        break; // Coincidió, no procesar el resto de parsers para esta línea
      }
    }

    if (!matched) {
      if (currentEntry && !isNewLog(line)) {
        currentEntry.message += `\n${line}`;
        currentEntry.raw += `\n${line}`;
        continue;
      }

      if (currentEntry) logEntries.push(currentEntry);

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
        raw: line
      };
    }
  }

  if (currentEntry) logEntries.push(currentEntry);
  return logEntries;
}

export function defaultLevels(): Set<LogLevel> {
  return new Set(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP']);
}
