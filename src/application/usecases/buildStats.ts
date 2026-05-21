import { LogEntry, LogLevel } from '../../domain/models/LogEntry';

export interface DashboardStats {
  total: number;
  errorCount: number;
  warnCount: number;
  uniqueServices: number;
}

export interface LevelDistribution {
  level: LogLevel;
  count: number;
}

export function buildStats(logs: LogEntry[]): DashboardStats {
  const total = logs.length;
  const errorCount = logs.filter(log => log.level === 'ERROR').length;
  const warnCount = logs.filter(log => log.level === 'WARN').length;
  const uniqueServices = new Set(logs.map(log => log.service).filter(s => s && s !== '-')).size;

  return { total, errorCount, warnCount, uniqueServices };
}

export function buildDistribution(logs: LogEntry[]): LevelDistribution[] {
  const levels: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
  const counts = new Map<LogLevel, number>();
  levels.forEach(level => counts.set(level, 0));
  logs.forEach(log => {
    if (counts.has(log.level)) {
      counts.set(log.level, (counts.get(log.level) || 0) + 1);
    }
  });

  return levels.map(level => ({ level, count: counts.get(level) || 0 })).filter(item => item.count > 0);
}
