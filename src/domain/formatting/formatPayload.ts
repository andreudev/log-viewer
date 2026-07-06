import { beautifyJson } from './beautifyJson';
import { beautifyXml } from './beautifyXml';
import { formatLooseJson } from './formatLooseJson';

export interface PayloadResult {
  kind: 'json' | 'xml' | 'none';
  title?: string;
  prefix?: string;
  suffix?: string;
  formatted?: string;
  raw?: string;
  parseable?: boolean;
}

function stripArtifacts(text: string): string {
  return text
    .replace(/\s*class="xml-[^"]+"\s*/g, '')
    .replace(/\s*class='xml-[^']+'\s*/g, '')
    .replace(/\s*class=\\"xml-[^\\"]+\\"\s*/g, '')
    .replace(/\s*class=&quot;xml-[^&]+&quot;\s*/g, '')
    .replace(/<span[^>]*class=["']xml-[^"']+["'][^>]*>/gi, '')
    .replace(/<span[^>]*class=["']json-[^"']+["'][^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .trim();
}

function extractXmlPayload(text: string): { prefix: string; xml: string; suffix: string } {
  const cleaned = stripArtifacts(text || '');
  const xmlStart = cleaned.indexOf('<');
  const xmlEscapedStart = cleaned.indexOf('&lt;');
  const xmlIndex = (xmlStart !== -1 && xmlEscapedStart !== -1) ? Math.min(xmlStart, xmlEscapedStart) : Math.max(xmlStart, xmlEscapedStart);
  if (xmlIndex === -1) {
    return { prefix: '', xml: cleaned, suffix: '' };
  }

  let prefix = cleaned.slice(0, xmlIndex).replace(/[_:\s-]+$/, '').trim();
  let payload = cleaned.slice(xmlIndex).trim();
  let suffix = '';
  const errorIndex = payload.indexOf(' - Error:');
  if (errorIndex !== -1) {
    suffix = payload.slice(errorIndex + 3).trim();
    payload = payload.slice(0, errorIndex).trim();
  }

  return { prefix, xml: payload, suffix };
}

export function formatPayload(message: string): PayloadResult {
  const cleaned = stripArtifacts(message.trim());
  if (!cleaned) return { kind: 'none' };

  const isXml = cleaned.startsWith('<') || cleaned.includes('&lt;') || cleaned.startsWith('<?xml');
  const isJson = cleaned.startsWith('{') || cleaned.startsWith('[');

  if (isXml) {
    const xmlPayload = extractXmlPayload(cleaned);
    return {
      kind: 'xml',
      title: 'Payload XML Formateado',
      prefix: xmlPayload.prefix || undefined,
      suffix: xmlPayload.suffix || undefined,
      formatted: beautifyXml(xmlPayload.xml || cleaned),
      raw: cleaned
    };
  }

  if (isJson) {
    return {
      kind: 'json',
      title: 'Payload JSON Formateado',
      formatted: beautifyJson(cleaned),
      raw: cleaned,
      parseable: true
    };
  }

  const xmlStart = cleaned.indexOf('<');
  const xmlEscapedStart = cleaned.indexOf('&lt;');
  const xmlIndex = (xmlStart !== -1 && xmlEscapedStart !== -1) ? Math.min(xmlStart, xmlEscapedStart) : Math.max(xmlStart, xmlEscapedStart);
  if (xmlIndex !== -1) {
    const xmlPayload = extractXmlPayload(cleaned);
    return {
      kind: 'xml',
      title: 'XML Embebido Detectado',
      prefix: xmlPayload.prefix || undefined,
      suffix: xmlPayload.suffix || undefined,
      formatted: beautifyXml(xmlPayload.xml || cleaned),
      raw: cleaned
    };
  }

  const jsonStart = cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : cleaned.indexOf('[');
  if (jsonStart !== -1) {
    const jsonEndChar = cleaned[jsonStart] === '{' ? '}' : ']';
    const jsonEnd = cleaned.lastIndexOf(jsonEndChar);
    if (jsonEnd > jsonStart) {
      const prefix = cleaned.slice(0, jsonStart).replace(/[_:\s-]+$/, '').trim();
      const payload = cleaned.slice(jsonStart, jsonEnd + 1).trim();
      let formatted = payload;
      let parseable = true;
      try {
        formatted = beautifyJson(payload);
      } catch {
        formatted = formatLooseJson(payload);
        parseable = false;
      }
      return {
        kind: 'json',
        title: parseable ? 'JSON Embebido Detectado' : 'JSON Embebido Detectado (sin parsear)',
        prefix: prefix || undefined,
        formatted,
        raw: cleaned,
        parseable
      };
    }
  }

  return { kind: 'none' };
}
