export interface ParserConfig {
  id: string;
  name: string;
  enabled: boolean;
  isSystem: boolean;
  regex: string; // Expresión regular en formato string
  mapping: {
    timestamp: number;    // Índice de grupo de captura (1-based)
    level: number;        // Índice de grupo de captura
    className?: number;   // Opcional, índice de grupo de captura
    thread?: number;      // Opcional, índice de grupo de captura
    message: number;      // Índice de grupo de captura
    correlationId?: number; // Opcional, índice de grupo de captura
    service?: number;     // Opcional, índice de grupo de captura
  };
  // Expresiones secundarias opcionales para extracción dentro de los campos
  correlationIdRegex?: string;
  classNameRegex?: string;
  serviceRegex?: string;
}

export const DEFAULT_PARSERS: ParserConfig[] = [
  {
    id: 'format-a',
    name: 'Formato A (Estándar Java/Logback)',
    enabled: true,
    isSystem: true,
    regex: '^(\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2},\\d{3})\\s+(TRACE|DEBUG|INFO|WARN|ERROR)\\s+([^\\s]+)\\s+\\[([^\\]]+)\\]\\s+(.*)$',
    mapping: {
      timestamp: 1,
      level: 2,
      className: 3,
      thread: 4,
      message: 5
    },
    correlationIdRegex: '\\[\\s*Peticion\\s+ID:\\s*([^\\s\\]]+)\\s*\\]',
    classNameRegex: '\\[\\s*Class:\\s*([^\\s\\]]+)\\s*\\]',
    serviceRegex: '\\[\\s*Endpoint:\\s*([^\\s\\]]+)\\s*\\]'
  },
  {
    id: 'format-b',
    name: 'Formato B (Capa Media Entrada/Salida)',
    enabled: true,
    isSystem: true,
    regex: '^(\\d{1,2}/\\d{1,2}/\\d{4}\\s\\d{1,2}:\\d{2}:\\d{2}\\s(?:AM|PM))\\s+-\\s+([^\\s]+)\\s+-\\s+METODO:\\s+([^\\s]+)\\s+-\\s+(INPUT|OUTPUT):\\s*(.*)$',
    mapping: {
      timestamp: 1,
      correlationId: 2,
      service: 3,
      level: 4,
      message: 5
    }
  },
  {
    id: 'format-c',
    name: 'Formato C (Tráfico SOAP/SSN)',
    enabled: true,
    isSystem: true,
    regex: '^\\[(\\d{2}-\\d{2}-\\d{4}\\s\\d{2}:\\d{2}:\\d{2})\\s+(REQ|RESP)\\s+-([^\\]]*)\\]:\\s*(.*)$',
    mapping: {
      timestamp: 1,
      level: 2,
      message: 4
    },
    correlationIdRegex: 'ssn:\\s*([^\\s\\-]+)'
  },
  {
    id: 'format-d',
    name: 'Formato D (Capa Media Java Custom / Live Test)',
    enabled: true,
    isSystem: true,
    regex: '^(\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2}[.,]\\d{3})\\s+\\[(TRACE|DEBUG|INFO|WARN|ERROR)\\]\\s+\\[([^\\]]+)\\]\\s+\\[([^\\]]+)\\]\\s+(.*)$',
    mapping: {
      timestamp: 1,
      level: 2,
      className: 3,
      correlationId: 4,
      message: 5
    }
  }
];
