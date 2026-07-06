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
  quickFilter?: 'NONE' | 'LATENCY' | 'INTEGRATION_ERRORS' | 'SOAP_TRAFFIC' | 'REQUESTS' | 'RESPONSES';
  /**
   * Numeric endpoint code to filter by (e.g. "1015"). When set, only logs
   * whose `endpoint` or `service` contains this value are kept.
   */
  endpointFilter?: string | null;
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

  const activeLevels = filters.activeLevels instanceof Set ? filters.activeLevels : new Set(filters.activeLevels || []);
  filtered = filtered.filter(log => activeLevels.has(log.level));

  if (filters.activeService !== 'ALL') {
    filtered = filtered.filter(log => log.service === filters.activeService);
  }

  if (filters.endpointFilter && filters.endpointFilter.trim()) {
    const needle = filters.endpointFilter.trim().toLowerCase();
    filtered = filtered.filter(log => {
      if (log.endpoint && log.endpoint.toLowerCase() === needle) return true;
      if (log.service && log.service.toLowerCase().includes(needle)) return true;
      // Last fallback: scan the raw line for "[ Endpoint: <code> ]"
      return (log.raw || '').toLowerCase().includes(`endpoint: ${needle}`);
    });
  }

  if (filters.correlationId) {
    filtered = filtered.filter(log => log.correlationId === filters.correlationId);
  }

  const safeDateFrom = filters.dateFrom ? (filters.dateFrom instanceof Date ? filters.dateFrom : new Date(filters.dateFrom)) : null;
  const safeDateTo = filters.dateTo ? (filters.dateTo instanceof Date ? filters.dateTo : new Date(filters.dateTo)) : null;
  const validDateFrom = safeDateFrom && !isNaN(safeDateFrom.getTime()) ? safeDateFrom : null;
  const validDateTo = safeDateTo && !isNaN(safeDateTo.getTime()) ? safeDateTo : null;

  if (validDateFrom || validDateTo) {
    filtered = filtered.filter(log => {
      const logDate = parseTimestamp(log.timestamp);
      if (!logDate) return true;
      if (validDateFrom && logDate < validDateFrom) return false;
      if (validDateTo && logDate > validDateTo) return false;
      return true;
    });
  }

  // Handle Quick Filters
  if (filters.quickFilter && filters.quickFilter !== 'NONE') {
    filtered = filtered.filter(log => {
      const msg = log.message || '';
      const msgLower = msg.toLowerCase();
      switch (filters.quickFilter) {
        case 'LATENCY':
          return log.deltaTimeMs !== undefined && log.deltaTimeMs > 2000;
        case 'INTEGRATION_ERRORS':
          return (
            log.level === 'ERROR' ||
            msgLower.includes('timeout') ||
            msgLower.includes('connection refused') ||
            msgLower.includes('sockettimeoutexception') ||
            msgLower.includes('exception') ||
            msgLower.includes('http 5') ||
            msgLower.includes('500 internal') ||
            msgLower.includes('error')
          );
        case 'SOAP_TRAFFIC':
          return (
            msg.includes('<soapenv:Envelope') ||
            msg.includes('<soap:') ||
            msg.includes('<?xml') ||
            msg.includes('<xml')
          );
        case 'REQUESTS':
          return log.level === 'REQ' || msgLower.includes('request') || msgLower.includes('petición') || msgLower.includes('peticion');
        case 'RESPONSES':
          return log.level === 'RESP' || msgLower.includes('response') || msgLower.includes('respuesta');
        default:
          return true;
      }
    });
  }

  if (filters.isPayloadsOnly) {
    filtered = filtered.filter(log => {
      const msg = log.message || '';
      return (msg.includes('{') && msg.includes('}')) || (msg.includes('<') && msg.includes('>'));
    });
  }

  if (filters.searchTerm) {
    if (filters.isRegexSearch) {
      try {
        const regex = new RegExp(filters.searchTerm, 'i');
        filtered = filtered.filter(log =>
          regex.test(log.message || '') ||
          regex.test(log.service || '') ||
          regex.test(log.correlationId || '') ||
          regex.test(log.className || '')
        );
      } catch {
        return filtered;
      }
    } else {
      const query = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        (log.message || '').toLowerCase().includes(query) ||
        (log.service || '').toLowerCase().includes(query) ||
        (log.correlationId || '').toLowerCase().includes(query) ||
        (log.className || '').toLowerCase().includes(query)
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
