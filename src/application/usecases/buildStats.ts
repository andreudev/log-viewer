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
  const baseLevels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
  const uniqueLevels = Array.from(new Set(logs.map(log => log.level).filter(Boolean)));
  const allLevels = Array.from(new Set([...baseLevels, ...uniqueLevels]));
  
  const counts = new Map<LogLevel, number>();
  allLevels.forEach(level => counts.set(level, 0));
  logs.forEach(log => {
    if (log.level) {
      counts.set(log.level, (counts.get(log.level) || 0) + 1);
    }
  });

  const sortedLevels = allLevels.sort((a, b) => {
    const idxA = baseLevels.indexOf(a);
    const idxB = baseLevels.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return sortedLevels.map(level => ({ level, count: counts.get(level) || 0 })).filter(item => item.count > 0);
}
