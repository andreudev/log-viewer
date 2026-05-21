import { LogEntry, LogLevel } from '../models/LogEntry';

const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];

export function parseLogs(text: string): LogEntry[] {
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];
  let buffer = '';

  const genericNewLogDetector = /^(?:\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})|^(?:\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}:\d{2})|^(?:\[\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/;

  for (let i = 0; i < rawLines.length; i++) {
    const cleanLine = rawLines[i].replace(/\r$/, '');
    const nextLine = i + 1 < rawLines.length ? rawLines[i + 1].trim() : '';
    const nextIsNewLog = genericNewLogDetector.test(nextLine);

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

  const regexFormatA = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+([^\s]+)\s+\[([^\]]+)\]\s+(.*)$/;
  const regexFormatB = /^(\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}:\d{2}\s(?:AM|PM))\s+-\s+([^\s]+)\s+-\s+METODO:\s+([^\s]+)\s+-\s+(INPUT|OUTPUT):\s*(.*)$/i;
  const regexFormatC = /^\[(\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})\s+(REQ|RESP)\s+-([^\]]*)\]:\s*(.*)$/i;

  for (const line of lines) {
    if (line.trim() === '') continue;

    const matchA = line.match(regexFormatA);
    const matchB = line.match(regexFormatB);
    const matchC = line.match(regexFormatC);

    if (matchA) {
      if (currentEntry) logEntries.push(currentEntry);

      const timestamp = matchA[1];
      const level = matchA[2].toUpperCase() as LogLevel;
      const logger = matchA[3];
      const thread = matchA[4];
      const remainingMessage = matchA[5];

      let correlationId = '-';
      let className = logger;
      let serviceName = '-';

      const correlationMatch = remainingMessage.match(/\[\s*Peticion\s+ID:\s*([^\s\]]+)\s*\]/i);
      if (correlationMatch) correlationId = correlationMatch[1];

      const classMatch = remainingMessage.match(/\[\s*Class:\s*([^\s\]]+)\s*\]/i);
      if (classMatch) className = classMatch[1].split('.').pop() || className;

      const endpointMatch = remainingMessage.match(/\[\s*Endpoint:\s*([^\s\]]+)\s*\]/i);
      if (endpointMatch) serviceName = `API Endpoint ${endpointMatch[1]}`;

      const serviceTypeMatch = remainingMessage.match(/\[\s*Service\s+Type:\s*([^\s\]]+)\s*\]/i);
      const sType = serviceTypeMatch ? serviceTypeMatch[1] : '';

      let finalMessage = remainingMessage;
      finalMessage = finalMessage
        .replace(/\[\s*Peticion\s+ID:\s*([^\s\]]+)\s*\]/gi, '')
        .replace(/\[\s*Class:\s*([^\s\]]+)\s*\]/gi, '')
        .replace(/\[\s*Endpoint:\s*([^\s\]]+)\s*\]/gi, '')
        .replace(/\[\s*Service\s+Type:\s*([^\s\]]+)\s*\]/gi, '')
        .replace(/^\s*:\s*/, '')
        .trim();

      const urlMatch = finalMessage.match(/(?:URL llamada|URL|GET METHOD):\s*_?https?:\/\/[^\/]+\/(.*)$/i);
      if (urlMatch) {
        serviceName = (sType ? `${sType}: ` : '') + urlMatch[1];
      }

      const paramMatch = finalMessage.match(/(?:Parámetros llamada Repositorio|Parámetros petición|Parámetros llamada Repositorio Login|Peticion WS Params):\s*_?(.*)$/i);
      if (paramMatch && serviceName === '-') {
        serviceName = 'API Invocation';
      }

      // Dynamic QA Error Elevation
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
        lowerMsg.includes('duplicate key');
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
        raw: line
      };
      continue;
    }

    if (matchB) {
      if (currentEntry) logEntries.push(currentEntry);

      const timestamp = matchB[1];
      const correlationId = matchB[2].trim();
      const serviceName = matchB[3].trim();
      const type = matchB[4].toUpperCase();
      const content = matchB[5].trim();

      let level: LogLevel = type === 'INPUT' ? 'REQ' : 'RESP';

      // Dynamic QA Error Elevation
      const lowerContent = content.toLowerCase();
      const hasErrorKeywords = 
        lowerContent.includes('[aseoledb]') ||
        lowerContent.includes('sp_cerror') ||
        (lowerContent.includes('error:') && !lowerContent.includes('error: []') && !lowerContent.includes('error: [ ]')) ||
        lowerContent.includes('exception') ||
        lowerContent.includes('timeout') ||
        lowerContent.includes('cuenta no esta') ||
        lowerContent.includes('cuenta no está') ||
        lowerContent.includes('duplicate key');
      if (hasErrorKeywords) {
        level = 'ERROR';
      }

      currentEntry = {
        id: ++logCounter,
        timestamp,
        level,
        thread: 'worker-proc',
        className: 'CapaMediaClient',
        service: serviceName,
        correlationId,
        message: content,
        raw: line
      };
      continue;
    }

    if (matchC) {
      if (currentEntry) logEntries.push(currentEntry);

      const timestamp = matchC[1];
      let level = matchC[2].toUpperCase() as LogLevel;
      const bracketInfo = matchC[3];
      const xmlPayload = matchC[4].trim();

      let correlationId = '-';
      const ssnMatch = bracketInfo.match(/ssn:\s*([^\s\-]+)/i);
      if (ssnMatch) correlationId = ssnMatch[1];

      let serviceName = 'SOAP Request';
      const xmlRootMatch = xmlPayload.match(/<([^\s>]+)/);
      if (xmlRootMatch) {
        serviceName = xmlRootMatch[1].replace(/_res$/, '').replace(/&lt;([^\s&>]+)/, '$1');
      }

      // Dynamic QA Error Elevation
      const lowerPayload = xmlPayload.toLowerCase();
      const hasErrorKeywords = 
        lowerPayload.includes('[aseoledb]') ||
        lowerPayload.includes('sp_cerror') ||
        (lowerPayload.includes('error:') && !lowerPayload.includes('error: []') && !lowerPayload.includes('error: [ ]')) ||
        lowerPayload.includes('exception') ||
        lowerPayload.includes('timeout') ||
        lowerPayload.includes('cuenta no esta') ||
        lowerPayload.includes('cuenta no está') ||
        lowerPayload.includes('duplicate key') ||
        lowerPayload.includes('codigo>2') ||
        lowerPayload.includes('ocurrio un error') ||
        lowerPayload.includes('ocurrió un error');
      if (hasErrorKeywords) {
        level = 'ERROR';
      }

      currentEntry = {
        id: ++logCounter,
        timestamp,
        level,
        thread: 'soap-nio',
        className: 'SoapSoapClient',
        service: serviceName,
        correlationId,
        message: xmlPayload,
        raw: line
      };
      continue;
    }

    if (currentEntry && !genericNewLogDetector.test(line)) {
      currentEntry.message += `\n${line}`;
      currentEntry.raw += `\n${line}`;
      continue;
    }

    if (currentEntry) logEntries.push(currentEntry);

    let level: LogLevel = 'INFO';
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
  if (currentEntry) logEntries.push(currentEntry);
  return logEntries;
}

export function defaultLevels(): Set<LogLevel> {
  return new Set(LOG_LEVELS);
}
