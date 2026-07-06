import { LogLevel } from './LogEntry';

export interface PromotionRule {
  id: string;
  pattern: string;
  targetLevel: LogLevel;
  customBadge: string;
  enabled: boolean;
}

export const DEFAULT_RULES: PromotionRule[] = [
  {
    id: '1',
    pattern: 'NO EXISTEN PRODUCTOS ASOCIADOS',
    targetLevel: 'WARN',
    customBadge: 'QA Alert',
    enabled: true
  }
];
