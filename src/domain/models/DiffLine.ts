export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}
