import { LogEntry, LogLevel } from '../models/LogEntry';
import { ParserConfig, DEFAULT_PARSERS } from '../models/ParserConfig';

// Palabras clave que elevan un log a nivel ERROR (mismas reglas que format-a)
const ERROR_KEYWORDS = [
  '[aseoledb]',
  'sp_cerror',
  'exception',
  'timeout',
  'cuenta no esta',
  'cuenta no está',
  'duplicate key',
  'codigo>2',
  'ocurrio un error',
  'ocurrió un error'
] as const;

/**
 * Detecta si una linea es JSON puro del formato `{"timestamp":...,"level":...}`.
 * Devuelve `{ obj, linesConsumed }` o null si no es JSON valido.
 *
 * Soporta dos variantes:
 * - JSONL (un registro por linea): el caso normal en este log.
 * - JSON multilinea: si la linea no cierra el objeto, intenta acumular
 *   las siguientes hasta que JSON.parse() tenga exito.
 */
function tryParseJsonRecord(
  line: string,
  followUps: string[]
): { obj: Record<string, unknown>; linesConsumed: number; raw: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"timestamp"')) return null;

  // Caso 1: JSONL (una linea = un objeto)
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj === 'object' && obj !== null) {
      return { obj, linesConsumed: 0, raw: trimmed };
    }
  } catch {
    // sigue intentando
  }

  // Caso 2: JSON multilinea (objeto cortado en varias lineas fisicas)
  let acc = trimmed;
  for (let i = 0; i < followUps.length && i < 20; i++) {
    acc += followUps[i];
    try {
      const obj = JSON.parse(acc);
      if (typeof obj === 'object' && obj !== null) {
        return { obj, linesConsumed: i + 1, raw: acc };
      }
    } catch {
      // sigue
    }
  }
  return null;
}

/**
 * Variante que devuelve TODOS los JSON concatenados en una linea.
 * Caso 3: el log real viene como  `{"timestamp":...} {"timestamp":...} {...}`
 * donde cada objeto esta separado por un espacio (no newline). El primer
 * JSON.parse falla porque sobra el segundo objeto, pero podemos splitear
 * por '}{' (con cuidado de preservar las llaves) y parsear cada chunk.
 *
 * Devuelve array vacio si no se pudo parsear nada.
 */
function tryParseMultipleJsonConcatenated(
  line: string,
  followUps: string[]
): { obj: Record<string, unknown>; linesConsumed: number; raw: string }[] {
  // Juntamos la linea + followUps para cubrir el caso en que un objeto
  // JSON este cortado entre lineas y concatenado con el siguiente.
  const fullText = [line, ...followUps].join('');
  const trimmed = fullText.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"timestamp"')) return [];

  // Buscamos TODAS las ocurrencias de '}{' (objeto cerrado seguido de abierto)
  // o '{' al inicio. Cada match delimita un objeto JSON.
  const results: { obj: Record<string, unknown>; linesConsumed: number; raw: string }[] = [];

  // Split inteligente: encontrar cada '}{' y separar ahi.
  // Estrategia: encontrar pares balanceados de { } usando un contador.
  const objs: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objs.push(trimmed.substring(start, i + 1));
        start = -1;
      }
    }
  }

  // Si quedo algo sin cerrar (depth > 0), descartamos ese fragmento.
  // Cada obj parseado individualmente cuenta 1 linea consumida proporcional.
  for (const candidate of objs) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null) {
        // Calcular cuantas lineas fisicas consume este candidato.
        // Es proporcional al tamano: si el candidato esta en la linea N
        // cubre lineas hasta donde termina.
        const consumedLines = countNewlinesIn(fullText, candidate);
        results.push({ obj: parsed, linesConsumed: consumedLines, raw: candidate });
      }
    } catch {
      // ignora candidatos invalidos
    }
  }

  return results;
}

/**
 * Cuenta cuantos saltos de linea hay en `fullText` hasta el final de
 * `candidate`. Util para calcular linesConsumed.
 */
function countNewlinesIn(fullText: string, candidate: string): number {
  const idx = fullText.indexOf(candidate);
  if (idx < 0) return 0;
  const upTo = fullText.substring(0, idx + candidate.length);
  let count = 0;
  for (let i = 0; i < upTo.length; i++) {
    if (upTo[i] === '\n') count++;
  }
  return count;
}

/**
 * Extrae el nombre corto de una clase FQN estilo Java.
 * "com.banrural.gt.repository.selphid.ValidacionIadRepositoryImp"
 *   -> "ValidacionIadRepositoryImp"
 */
function shortClassName(fqn: string | undefined | null): string {
  if (!fqn) return '-';
  const parts = fqn.split('.');
  return parts[parts.length - 1] || fqn;
}

/**
 * Eleva el nivel a ERROR si el mensaje contiene palabras clave criticas.
 */
function elevateLevelForErrors(level: LogLevel, message: string): LogLevel {
  const lower = message.toLowerCase();
  // "error:" valido solo si NO es "error: []" o "error: [ ]" (vacio)
  const hasRealError =
    lower.includes('[aseoledb]') ||
    lower.includes('sp_cerror') ||
    lower.includes('exception') ||
    lower.includes('timeout') ||
    lower.includes('cuenta no esta') ||
    lower.includes('cuenta no está') ||
    lower.includes('duplicate key') ||
    lower.includes('codigo>2') ||
    lower.includes('ocurrio un error') ||
    lower.includes('ocurrió un error') ||
    (lower.includes('error:') && !lower.includes('error: []') && !lower.includes('error: [ ]'));
  return hasRealError ? 'ERROR' : level;
}

/**
 * Construye un LogEntry a partir de un objeto JSON parseado del formato:
 *   { timestamp, level, class, thread, peticion_id, endpoint, clase_origen, message:{Detalle:...} }
 *
 * El campo `class` del log es siempre "c.b.g.t.LoggingService" (generico).
 * Usamos `clase_origen` que trae la clase real. Si tampoco esta,
 * caemos a "shortClassName(class)".
 */
function buildEntryFromJson(obj: Record<string, unknown>, id: number): LogEntry | null {
  const timestamp = typeof obj.timestamp === 'string' ? obj.timestamp : '';
  if (!timestamp) return null; // sin timestamp no es un log reconocible

  let level = String(obj.level || 'INFO').toUpperCase();
  if (level === 'INPUT') level = 'REQ';
  if (level === 'OUTPUT') level = 'RESP';

  const thread = typeof obj.thread === 'string' && obj.thread.trim() ? obj.thread : '-';

  // clase_origen manda si esta; si no, class generico
  const fqn =
    typeof obj.clase_origen === 'string' && obj.clase_origen
      ? obj.clase_origen
      : typeof obj.class === 'string'
        ? obj.class
        : '';
  const className = fqn ? shortClassName(fqn) : '-';

  const correlationId =
    typeof obj.peticion_id === 'string' && obj.peticion_id
      ? obj.peticion_id
      : '-';

  // Endpoint: si existe, el service se vuelve "EP <endpoint>".
  // Si no existe, usamos la clase como service para que la tabla tenga
  // algo legible en vez de "-".
  const endpoint =
    typeof obj.endpoint === 'string' && obj.endpoint.trim()
      ? obj.endpoint
      : undefined;
  const service = endpoint ? `EP ${endpoint}` : className;

  // message es un objeto con sub-campos variables segun el tipo de log.
  // En el log real de capa-media pueden venir como keys:
  //   - "Detalle"              (el mas comun)
  //   - "Respuesta WebService" (XML/JSON devuelto por SOAP/REST)
  //   - "URL" / "URL llamada"  (URL invocada)
  //   - "Parámetros petición"  (body enviado)
  //   - "Parámetros llamada Repositorio Login"
  //   - "decodedBody"          (request body descifrado)
  //   - "Peticion del usuario" (placeholder del controller)
  //
  // Estrategia: tomar el PRIMER sub-campo con valor string no vacio.
  // Antes serializabamos todo el objeto como message, lo que producia
  // strings como '{"Respuesta WebService":"..."}' (literal) en la UI.
  // Tambien evitamos mostrar JSON literal cuando message es un objeto
  // sin sub-campos string (ej: {someObj:{...}} o {} o solo arrays).
  // En su lugar mostramos un resumen legible como "[payload: 2 fields]"
  // o "<key>: <preview>" segun el caso.
  let message = '';
  const msg = obj.message;
  if (typeof msg === 'string') {
    message = msg;
  } else if (msg && typeof msg === 'object') {
    const m = msg as Record<string, unknown>;
    // Prioridad: Detalle > cualquier otro sub-campo string no vacio.
    let found = false;
    if (typeof m.Detalle === 'string' && m.Detalle.length > 0) {
      message = m.Detalle;
      found = true;
    }
    if (!found) {
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (typeof v === 'string' && v.length > 0) {
          // Prefijamos la key para que el usuario sepa qué tipo de
          // mensaje es (ej "URL: http://...", "Respuesta: <inicio_sesion>")
          message = `${key}: ${v}`;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      // Sub-campos son objetos/arrays o el message es {}.
      // Evitamos mostrar JSON literal crudo en la UI. En su lugar
      // mostramos un resumen legible.
      const keys = Object.keys(m);
      if (keys.length === 0) {
        // message es {} -> nada que mostrar
        message = '';
      } else {
        // Construimos un resumen: "<key1>: <preview>, <key2>: <preview>"
        const parts: string[] = [];
        for (const k of keys.slice(0, 3)) {
          const v = m[k];
          let preview: string;
          if (v === null || v === undefined) {
            preview = 'null';
          } else if (Array.isArray(v)) {
            preview = `[${v.length} items]`;
          } else if (typeof v === 'object') {
            preview = `{${Object.keys(v as object).length} fields}`;
          } else if (typeof v === 'number' || typeof v === 'boolean') {
            preview = String(v);
          } else {
            preview = String(v).slice(0, 30);
          }
          parts.push(`${k}: ${preview}`);
        }
        if (keys.length > 3) parts.push(`+${keys.length - 3} more`);
        message = `[payload] ${parts.join(', ')}`;
      }
    }
  }

  const finalLevel = elevateLevelForErrors(level, message);

  return {
    id,
    timestamp,
    level: finalLevel,
    thread,
    className,
    service,
    correlationId,
    message,
    raw: typeof obj.__raw === 'string' ? obj.__raw : JSON.stringify(obj),
    endpoint,
    originalId: id,
  };
}

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
    if (line.trim().startsWith('{') && line.includes('"timestamp"')) return true;
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

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line.trim() === '') continue;

    // === JSON FAST-PATH ===
    // Lineas que arrancan con `{"timestamp":` se parsean como JSON
    // antes que cualquier regex. Esto evita que caigan al fallback
    // "SystemLogger" y muestra timestamp/level/service reales.
    //
    // Caso 1: 1 JSON por linea (JSONL normal)
    // Caso 2: 1 JSON cortado en varias lineas fisicas
    // Caso 3: N JSON concatenados con espacios en 1 sola linea
    //   (caso del log de capa-media: "{...} {...} {...}")
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('{') && trimmedLine.includes('"timestamp"')) {
      const followUps = lines.slice(lineIdx + 1, lineIdx + 21);
      const parsed = tryParseJsonRecord(line, followUps);
      if (parsed) {
        if (currentEntry) logEntries.push(currentEntry);
        const entry = buildEntryFromJson(parsed.obj, ++logCounter);
        if (entry) {
          entry.raw = parsed.raw;
          currentEntry = entry;
          lineIdx += parsed.linesConsumed;
          continue;
        }
      }

      // Caso 3 fallback: varios JSON concatenados con espacios.
      // El JSON simple fallo (probablemente porque hay un segundo objeto
      // pegado). Intentamos separar por '}{' balanceado y parsear cada uno.
      const concatenated = tryParseMultipleJsonConcatenated(line, followUps);
      if (concatenated.length > 0) {
        if (currentEntry) logEntries.push(currentEntry);
        let consumed = 0;
        for (const { obj, raw, linesConsumed } of concatenated) {
          const entry = buildEntryFromJson(obj, ++logCounter);
          if (entry) {
            entry.raw = raw;
            logEntries.push(entry);
            // Tomar el mayor linesConsumed (es la cantidad de lineas
            // fisicas que ocupa TODA la linea concatenada).
            if (linesConsumed > consumed) consumed = linesConsumed;
          }
        }
        currentEntry = null;
        lineIdx += consumed;
        continue;
      }
    }

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
