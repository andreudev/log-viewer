import { DiffLine } from '../models/DiffLine';

export function computeDiff(textA: string, textB: string): { left: DiffLine[]; right: DiffLine[] } {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  
  const maxLines = 500;
  const truncatedA = linesA.slice(0, maxLines);
  const truncatedB = linesB.slice(0, maxLines);
  
  const dp: number[][] = Array(truncatedA.length + 1).fill(0).map(() => Array(truncatedB.length + 1).fill(0));
  
  for (let i = 1; i <= truncatedA.length; i++) {
    for (let j = 1; j <= truncatedB.length; j++) {
      if (truncatedA[i - 1].trim() === truncatedB[j - 1].trim()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = truncatedA.length;
  let j = truncatedB.length;
  
  const actions: { type: 'match' | 'delete' | 'insert'; lineA?: string; lineB?: string }[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && truncatedA[i - 1].trim() === truncatedB[j - 1].trim()) {
      actions.push({ type: 'match', lineA: truncatedA[i - 1], lineB: truncatedB[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      actions.push({ type: 'insert', lineB: truncatedB[j - 1] });
      j--;
    } else {
      actions.push({ type: 'delete', lineA: truncatedA[i - 1] });
      i--;
    }
  }
  
  actions.reverse();
  
  const leftSide: DiffLine[] = [];
  const rightSide: DiffLine[] = [];
  
  actions.forEach(action => {
    if (action.type === 'match') {
      leftSide.push({ type: 'unchanged', value: action.lineA || '' });
      rightSide.push({ type: 'unchanged', value: action.lineB || '' });
    } else if (action.type === 'delete') {
      leftSide.push({ type: 'removed', value: action.lineA || '' });
      rightSide.push({ type: 'unchanged', value: '' });
    } else if (action.type === 'insert') {
      leftSide.push({ type: 'unchanged', value: '' });
      rightSide.push({ type: 'added', value: action.lineB || '' });
    }
  });
  
  if (linesA.length > maxLines) {
    leftSide.push({ type: 'unchanged', value: `... [Truncado, ${linesA.length - maxLines} líneas omitidas]` });
  }
  if (linesB.length > maxLines) {
    rightSide.push({ type: 'unchanged', value: `... [Truncado, ${linesB.length - maxLines} líneas omitidas]` });
  }
  
  return { left: leftSide, right: rightSide };
}
