import { LogLevel } from '../../domain/models/LogEntry';

export const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];

export const LEVEL_META: Record<string, { color: string }> = {
  TRACE: { color: '0, 0%, 65%' },
  DEBUG: { color: '210, 40%, 58%' },
  INFO:  { color: '120, 25%, 50%' },
  WARN:  { color: '35, 50%, 58%' },
  ERROR: { color: '0, 55%, 55%' },
  REQ:   { color: '170, 30%, 48%' },
  RESP:  { color: '50, 35%, 55%' }
};

export function getLevelColor(level: string): string {
  const normalized = (level || '').toUpperCase();
  const standard = LEVEL_META[normalized];
  if (standard) return standard.color;

  // Algoritmo de Hashing HSL determinista para niveles dinámicos
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  const s = 45 + Math.abs((hash >> 8) % 25); // 45% - 70% saturación
  const l = 50 + Math.abs((hash >> 16) % 12); // 50% - 62% brillo
  return `${h}, ${s}%, ${l}%`;
}
