import { LogEntry, LogLevel } from '../../domain/models/LogEntry';
import { parseTimestamp } from '../../domain/parsing/parseTimestamp';

export interface FilterState {
  activeLevels: Set<LogLevel>;
  activeService: string;
  searchTerm: string;
  isRegexSearch: boolean;
  isPayloadsOnly: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  correlationId: string | null;
}

export type SortColumn = 'timestamp' | 'level' | 'service' | 'correlationId' | 'message' | null;
export type SortDirection = 'asc' | 'desc';

export function applyFilters(
  logs: LogEntry[],
  filters: FilterState,
  sortColumn: SortColumn,
  sortDirection: SortDirection
): LogEntry[] {
  let filtered = logs;

  filtered = filtered.filter(log => filters.activeLevels.has(log.level));

  if (filters.activeService !== 'ALL') {
    filtered = filtered.filter(log => log.service === filters.activeService);
  }

  if (filters.correlationId) {
    filtered = filtered.filter(log => log.correlationId === filters.correlationId);
  }

  if (filters.dateFrom || filters.dateTo) {
    filtered = filtered.filter(log => {
      const logDate = parseTimestamp(log.timestamp);
      if (!logDate) return true;
      if (filters.dateFrom && logDate < filters.dateFrom) return false;
      if (filters.dateTo && logDate > filters.dateTo) return false;
      return true;
    });
  }

  if (filters.isPayloadsOnly) {
    filtered = filtered.filter(log => {
      const msg = log.message;
      return (msg.includes('{') && msg.includes('}')) || (msg.includes('<') && msg.includes('>'));
    });
  }

  if (filters.searchTerm) {
    if (filters.isRegexSearch) {
      try {
        const regex = new RegExp(filters.searchTerm, 'i');
        filtered = filtered.filter(log =>
          regex.test(log.message) ||
          regex.test(log.service) ||
          regex.test(log.correlationId) ||
          regex.test(log.className)
        );
      } catch {
        return filtered;
      }
    } else {
      const query = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        log.service.toLowerCase().includes(query) ||
        log.correlationId.toLowerCase().includes(query) ||
        log.className.toLowerCase().includes(query)
      );
    }
  }

  if (sortColumn) {
    const key = sortColumn;
    const dir = sortDirection === 'asc' ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      if (key === 'timestamp') {
        const dateA = parseTimestamp(a.timestamp);
        const dateB = parseTimestamp(b.timestamp);
        if (dateA && dateB) {
          return (dateA.getTime() - dateB.getTime()) * dir;
        }
        if (dateA && !dateB) return -1 * dir;
        if (!dateA && dateB) return 1 * dir;
      }
      const valA = (a[key] || '').toString().toLowerCase();
      const valB = (b[key] || '').toString().toLowerCase();
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }

  return filtered;
}
