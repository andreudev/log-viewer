export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'REQ' | 'RESP';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  thread: string;
  className: string;
  service: string;
  correlationId: string;
  message: string;
  raw: string;
  deltaTimeMs?: number;
  originFile?: string;
  customBadge?: string;
}
