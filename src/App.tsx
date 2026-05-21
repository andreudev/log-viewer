import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { parseLogs, defaultLevels } from './domain/parsing/parseLogs';
import { applyFilters, FilterState, SortColumn, SortDirection } from './application/usecases/applyFilters';
import { buildStats, buildDistribution } from './application/usecases/buildStats';
import { fetchFileContent, fetchFiles, LogFileMeta } from './infrastructure/api/filesApi';
import { LogEntry, LogLevel } from './domain/models/LogEntry';
import { formatPayload } from './domain/formatting/formatPayload';
import { highlightJson } from './domain/formatting/highlightJson';
import { highlightXml } from './domain/formatting/highlightXml';
import { parseTimestamp } from './domain/parsing/parseTimestamp';

// Upgrades Premium
import { useKeyboardShortcuts } from './presentation/hooks/useKeyboardShortcuts';
import { AnalyticsDashboard } from './presentation/components/AnalyticsDashboard';
import { highlightHtmlText } from './domain/formatting/highlightHtmlText';

const PAGE_SIZE = 200;
const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
const LEVEL_META: Record<string, { color: string }> = {
  TRACE: { color: '0, 0%, 65%' },
  DEBUG: { color: '210, 40%, 58%' },
  INFO:  { color: '120, 25%, 50%' },
  WARN:  { color: '35, 50%, 58%' },
  ERROR: { color: '0, 55%, 55%' },
  REQ:   { color: '170, 30%, 48%' },
  RESP:  { color: '50, 35%, 55%' }
};

interface PromotionRule {
  id: string;
  pattern: string;
  targetLevel: LogLevel;
  customBadge: string;
  enabled: boolean;
}

const DEFAULT_RULES: PromotionRule[] = [
  {
    id: '1',
    pattern: 'NO EXISTEN PRODUCTOS ASOCIADOS',
    targetLevel: 'WARN',
    customBadge: 'QA Alert',
    enabled: true
  }
];

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toLocalISOString(date: Date): string {
  const tzoffset = date.getTimezoneOffset() * 60000;
  return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
}

function highlightText(text: string, search: string, isRegex: boolean): React.ReactNode {
  if (!search) return text;
  try {
    let regex: RegExp;
    if (isRegex) {
      regex = new RegExp(`(${search})`, 'gi');
    } else {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(`(${escaped})`, 'gi');
    }
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? <mark key={i} className="search-match">{part}</mark> : part
        )}
      </>
    );
  } catch {
    return text;
  }
}

function getFileColorStyle(fileName: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < fileName.length; i++) {
    hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    color: `hsl(${hue}, 45%, 65%)`,
    borderColor: `hsla(${hue}, 45%, 65%, 0.35)`,
    backgroundColor: `hsla(${hue}, 45%, 65%, 0.08)`
  };
}

function runDiagnosis(msg: string): string | null {
  const txt = msg.toLowerCase();
  if (txt.includes("attempt to insert duplicate key row in object") && txt.includes("unique index")) {
    const tableMatch = msg.match(/object\s+'([^']+)'/i);
    const indexMatch = msg.match(/unique index\s+'([^']+)'/i);
    const tbl = tableMatch ? tableMatch[1] : 'desconocida';
    const idx = indexMatch ? indexMatch[1] : 'desconocido';
    return `<b>Error de Clave Duplicada (SQL Server / Sybase).</b><br>
            Se intentó insertar un registro duplicado en <code>${tbl}</code> bajo el índice <code>${idx}</code>.<br>
            <i>Acción correctiva:</i> Verificar que la petición no se haya enviado dos veces.`;
  }
  if (txt.includes("cuenta no esta vigente") || txt.includes("cuenta no está vigente")) {
    return `<b>Cuenta Inactiva / No Vigente.</b><br>
            La cuenta está bloqueada o inactiva en el core bancario.<br>
            <i>Acción correctiva:</i> Revisar estado de la cuenta.`;
  }
  if (txt.includes("timeout") || txt.includes("sockettimeoutexception")) {
    return `<b>Timeout de Conexión.</b><br>
            La conexión con el WS/API externa tardó más de lo permitido.<br>
            <i>Acción correctiva:</i> Comprobar conectividad con el servicio.`;
  }
  if (txt.includes("nullpointerexception")) {
    return `<b>NullPointerException.</b><br>
            Se intentó acceder a un objeto nulo en el servidor Java.<br>
            <i>Acción correctiva:</i> Reportar al equipo de desarrollo con la traza completa.`;
  }
  return null;
}

function calculateDeltas(entries: LogEntry[]): LogEntry[] {
  const parsedDates = new Map<number, number>();
  entries.forEach(e => {
    const d = parseTimestamp(e.timestamp);
    if (d) {
      parsedDates.set(e.id, d.getTime());
    }
  });

  const groups = new Map<string, LogEntry[]>();
  entries.forEach(entry => {
    const cid = entry.correlationId;
    if (cid && cid !== '-') {
      if (!groups.has(cid)) {
        groups.set(cid, []);
      }
      groups.get(cid)!.push(entry);
    }
  });

  groups.forEach((groupEntries) => {
    groupEntries.sort((a, b) => {
      const timeA = parsedDates.get(a.id) || 0;
      const timeB = parsedDates.get(b.id) || 0;
      return timeA - timeB;
    });

    for (let i = 1; i < groupEntries.length; i++) {
      const prev = groupEntries[i - 1];
      const curr = groupEntries[i];
      const prevTime = parsedDates.get(prev.id);
      const currTime = parsedDates.get(curr.id);
      if (prevTime !== undefined && currTime !== undefined) {
        curr.deltaTimeMs = currTime - prevTime;
      }
    }
  });

  return entries;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

function computeDiff(textA: string, textB: string): { left: DiffLine[]; right: DiffLine[] } {
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

export function App() {
  const [files, setFiles] = useState<LogFileMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    activeLevels: defaultLevels(), activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, correlationId: null
  });
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeLog, setActiveLog] = useState<LogEntry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark-theme');

  // Upgrades premium states
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'feed' | 'metrics'>('feed');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [rulesJsonInput, setRulesJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [rules, setRules] = useState<PromotionRule[]>(() => {
    try {
      const saved = localStorage.getItem('promotionRules');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error loading rules from localStorage", e);
    }
    return DEFAULT_RULES;
  });

  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('pinnedKeys');
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error loading pinnedKeys", e);
    }
    return new Set();
  });

  const togglePin = useCallback((log: LogEntry) => {
    const key = `${log.originFile || 'upload'}::${log.originalId || log.id}`;
    setPinnedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      localStorage.setItem('pinnedKeys', JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const [compareQueue, setCompareQueue] = useState<LogEntry[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const handleLeftScroll = () => {
    if (leftRef.current && rightRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
      rightRef.current.scrollLeft = leftRef.current.scrollLeft;
    }
  };

  const handleRightScroll = () => {
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
      leftRef.current.scrollLeft = rightRef.current.scrollLeft;
    }
  };

  useEffect(() => { document.body.className = theme; localStorage.setItem('theme', theme); }, [theme]);

  // Save rules
  useEffect(() => {
    localStorage.setItem('promotionRules', JSON.stringify(rules));
  }, [rules]);

  // Load and merge logic
  const loadAndMergeFiles = useCallback(async (fileNames: string[], uploaded: Record<string, string>, currentRules: PromotionRule[]) => {
    if (fileNames.length === 0) {
      setParsedLogs([]);
      return;
    }
    
    try {
      // 1. Fetch all contents in parallel
      const contents = await Promise.all(
        fileNames.map(async name => {
          if (uploaded[name]) {
            return { name, content: uploaded[name] };
          }
          const content = await fetchFileContent(name);
          return { name, content };
        })
      );

      // 2. Parse and assign originalId, originFile
      let allEntries: LogEntry[] = [];
      contents.forEach(({ name, content }) => {
        const parsed = parseLogs(content);
        parsed.forEach(entry => {
          entry.originFile = name;
          entry.originalId = entry.id; // Preserve original file ID
        });
        allEntries = allEntries.concat(parsed);
      });

      // 3. Apply promotion rules
      allEntries.forEach(entry => {
        for (const rule of currentRules) {
          if (rule.enabled && entry.message.includes(rule.pattern)) {
            entry.level = rule.targetLevel;
            entry.customBadge = rule.customBadge;
            break; // Apply first matching rule
          }
        }
      });

      // 4. Sort chronologically
      const parsedDates = new Map<number, number>();
      allEntries.forEach((e, idx) => {
        const d = parseTimestamp(e.timestamp);
        if (d) {
          parsedDates.set(idx, d.getTime());
        }
      });

      allEntries.sort((a, b) => {
        const indexA = allEntries.indexOf(a);
        const indexB = allEntries.indexOf(b);
        const timeA = parsedDates.get(indexA) || 0;
        const timeB = parsedDates.get(indexB) || 0;
        if (timeA !== timeB) return timeA - timeB;
        return indexA - indexB;
      });

      // 5. Reassign global sequence id (1 to N)
      allEntries.forEach((entry, idx) => {
        entry.id = idx + 1;
      });

      // 6. Calculate deltas chronologically per correlationId
      const withDeltas = calculateDeltas(allEntries);

      setParsedLogs(withDeltas);
    } catch (error) {
      console.error("Error loading and merging files:", error);
    }
  }, []);

  // Sync loaded logs when files, uploaded files, or rules change
  useEffect(() => {
    loadAndMergeFiles(selectedFiles, uploadedFiles, rules);
  }, [selectedFiles, uploadedFiles, rules, loadAndMergeFiles]);

  // Initial load
  useEffect(() => {
    setLoadingFiles(true);
    fetchFiles().then(async (f) => {
      setFiles(f);
      setLoadingFiles(false);
      
      let initialSelected: string[] = [];
      try {
        const saved = localStorage.getItem('selectedFiles');
        if (saved) {
          initialSelected = JSON.parse(saved);
        }
      } catch (e) {
        console.error("Error loading selectedFiles from localStorage", e);
      }

      if (initialSelected.length === 0) {
        const lastActiveName = localStorage.getItem('activeFileName');
        if (lastActiveName) {
          const found = f.find(file => file.name === lastActiveName);
          if (found) {
            initialSelected = [found.name];
          }
        }
      }

      if (initialSelected.length === 0 && f.length > 0) {
        initialSelected = [f[0].name];
      }

      if (initialSelected.length > 0) {
        setSelectedFiles(initialSelected);
        localStorage.setItem('selectedFiles', JSON.stringify(initialSelected));
      }
    });
  }, []);

  const uniqueServices = useMemo(() =>
    Array.from(new Set(parsedLogs.map(l => l.service).filter(s => s && s !== '-'))).sort(), [parsedLogs]
  );

  const filteredLogs = useMemo(() => applyFilters(parsedLogs, filters, sortColumn, sortDirection), [parsedLogs, filters, sortColumn, sortDirection]);
  const stats = useMemo(() => buildStats(parsedLogs), [parsedLogs]);
  const distribution = useMemo(() => buildDistribution(filteredLogs), [filteredLogs]);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageLogs = filteredLogs.slice(pageStart, pageStart + PAGE_SIZE);
  const activeDiagnosis = activeLog ? runDiagnosis(activeLog.message) : null;

  const handleFileCheckboxToggle = useCallback((fileName: string) => {
    setSelectedFiles(prev => {
      let next: string[];
      if (prev.includes(fileName)) {
        next = prev.filter(f => f !== fileName);
      } else {
        next = [...prev, fileName];
      }
      localStorage.setItem('selectedFiles', JSON.stringify(next));
      return next;
    });
    setFilters(p => ({ ...p, activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, correlationId: null, activeLevels: defaultLevels() }));
    setCurrentPage(1);
    setActiveLog(null);
    setIsDrawerOpen(false);
  }, []);

  const handleFileSelectOnly = useCallback((fileName: string) => {
    setSelectedFiles([fileName]);
    localStorage.setItem('selectedFiles', JSON.stringify([fileName]));
    localStorage.setItem('activeFileName', fileName);
    setFilters(p => ({ ...p, activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, correlationId: null, activeLevels: defaultLevels() }));
    setCurrentPage(1);
    setActiveLog(null);
    setIsDrawerOpen(false);
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      
      setUploadedFiles(prev => {
        const next = { ...prev, [file.name]: content };
        return next;
      });

      setSelectedFiles(prev => {
        const next = prev.includes(file.name) ? prev : [...prev, file.name];
        localStorage.setItem('selectedFiles', JSON.stringify(next));
        return next;
      });
      
      localStorage.setItem('activeFileName', file.name);
      setFilters(p => ({ ...p, activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, correlationId: null, activeLevels: defaultLevels() }));
      setSortColumn(null); setSortDirection('asc'); setCurrentPage(1); setActiveLog(null); setIsDrawerOpen(false);
    };
    reader.readAsText(file);
  }, []);

  const copyText = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { console.warn('Copy failed'); }
  }, []);

  const handleExportMarkdown = useCallback((log: LogEntry) => {
    const payloadInfo = formatPayload(log.message);
    const codeBlock = payloadInfo.formatted ? `\`\`\`${payloadInfo.kind === 'xml' ? 'xml' : 'json'}\n${payloadInfo.formatted}\n\`\`\`` : `\`\`\`text\n${log.message}\n\`\`\``;
    
    const report = `### 🚨 Reporte de Incidencia - LogScope
- **Registro ID:** #${log.id}
- **Nivel:** ${log.level}
- **Servicio/Método:** \`${log.service}\`
- **ID Correlación:** \`${log.correlationId}\`
- **Clase Origen:** \`${log.className}\`
- **Marca de Tiempo:** ${log.timestamp}
- **Hilo:** \`${log.thread}\`

#### 📝 Detalle / Payload:
${codeBlock}

---
*Reporte generado automáticamente desde LogScope Analyzer*`;

    copyText(report);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  }, [copyText]);

  const handleLevelClick = useCallback((level: LogLevel) => {
    const isAllActive = filters.activeLevels.size === LOG_LEVELS.length;
    let newLevels: Set<LogLevel>;
    if (isAllActive) {
      newLevels = new Set([level]);
    } else {
      newLevels = new Set(filters.activeLevels);
      if (newLevels.has(level)) {
        newLevels.delete(level);
        if (newLevels.size === 0) {
          newLevels = defaultLevels();
        }
      } else {
        newLevels.add(level);
      }
    }
    setFilters(p => ({ ...p, activeLevels: newLevels }));
    setCurrentPage(1);
  }, [filters.activeLevels]);

  const openRulesModal = () => {
    setRulesJsonInput(JSON.stringify(rules, null, 2));
    setJsonError(null);
    setIsRulesModalOpen(true);
  };

  const handleSaveRulesJson = () => {
    try {
      const parsed = JSON.parse(rulesJsonInput);
      if (!Array.isArray(parsed)) {
        throw new Error("El JSON debe ser un arreglo de reglas.");
      }
      parsed.forEach((r, idx) => {
        if (!r.pattern || !r.targetLevel || !r.customBadge) {
          throw new Error(`La regla en la posición ${idx} le faltan campos obligatorios (pattern, targetLevel, customBadge).`);
        }
      });
      setRules(parsed);
      setJsonError(null);
      setIsRulesModalOpen(false);
    } catch (e: any) {
      setJsonError(e.message || "JSON inválido.");
    }
  };

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Vim & Gmail like Keyboard Shortcuts hook
  useKeyboardShortcuts({
    focusedIndex,
    setFocusedIndex,
    maxIndex: filteredLogs.length,
    onSelectRow: (idx) => {
      const log = filteredLogs[idx];
      if (log) {
        setActiveLog(log);
        setIsDrawerOpen(true);
      }
    },
    onPinRow: (idx) => {
      const log = filteredLogs[idx];
      if (log) {
        togglePin(log);
      }
    },
    onCompareRow: (idx) => {
      const log = filteredLogs[idx];
      if (log) {
        setCompareQueue(prev => {
          const exists = prev.some(c => c.id === log.id);
          if (exists) {
            return prev.filter(c => c.id !== log.id);
          } else {
            if (prev.length >= 2) return prev;
            return [...prev, log];
          }
        });
      }
    },
    onSearchFocus: () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.focus();
        (searchInput as HTMLInputElement).select();
      }
    },
    onCloseAll: () => {
      setIsDrawerOpen(false);
      setIsCompareModalOpen(false);
    },
    isDrawerOpen,
    isCompareModalOpen
  });

  // Handle focus scrolling
  useEffect(() => {
    if (focusedIndex !== null) {
      const activeElement = filteredLogs[focusedIndex];
      if (activeElement) {
        const row = document.getElementById(`log-row-${activeElement.id}`);
        if (row) {
          row.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        }
      }
    }
  }, [focusedIndex, filteredLogs]);

  const KPI_CARDS = [
    { icon: 'receipt_long', label: 'Logs Parseados', value: stats.total, sub: selectedFiles.length > 0 ? `${selectedFiles.length} archivos seleccionados` : 'Ningún archivo', cls: 'blue' },
    { icon: 'error_outline', label: 'Errores Detectados', value: stats.errorCount, sub: stats.total ? `${((stats.errorCount / stats.total) * 100).toFixed(1)}% del total` : '0%', cls: 'red' },
    { icon: 'warning_amber', label: 'Advertencias (Warn)', value: stats.warnCount, sub: 'Alertas en ejecución', cls: 'yellow' },
    { icon: 'dns', label: 'Servicios Únicos', value: stats.uniqueServices, sub: `${stats.uniqueServices} endpoints`, cls: 'purple' }
  ];

  const isMultiFileActive = selectedFiles.length > 1;

  return (
    <div className={`app-container ${theme}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <span className="material-icons-round logo-icon">terminal</span>
            <div><h1>LogScope</h1><span className="sub-logo">Capa Media Analyzer</span></div>
          </div>
        </div>
        <div className="sidebar-section">
          <div className="section-title">
            <span>ARCHIVOS LOCALES</span>
            <button className="icon-button" title="Refrescar" onClick={() => { setLoadingFiles(true); fetchFiles().then(f => { setFiles(f); setLoadingFiles(false); }); }}>
              <span className="material-icons-round">refresh</span>
            </button>
          </div>
          <div className="files-list">
            {loadingFiles ? <div className="zero-state"><div className="loader-spinner"></div><p>Cargando archivos...</p></div>
            : files.length === 0 && Object.keys(uploadedFiles).length === 0 ? <div className="zero-state"><p>No se encontraron logs (.log/.txt) en la carpeta.</p></div>
            : (() => {
                const allFiles = [...files];
                Object.keys(uploadedFiles).forEach(name => {
                  if (!allFiles.some(f => f.name === name)) {
                    allFiles.push({
                      name,
                      sizeBytes: uploadedFiles[name].length,
                      modifiedAt: new Date().toISOString(),
                      createdAt: new Date().toISOString()
                    });
                  }
                });

                return allFiles.map(file => {
                  const isChecked = selectedFiles.includes(file.name);
                  return (
                    <div 
                      key={file.name} 
                      className={`file-item-row ${isChecked ? 'active' : ''}`}
                    >
                      <label className="file-checkbox-label" title="Seleccionar para combinar">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => handleFileCheckboxToggle(file.name)} 
                        />
                      </label>
                      <button 
                        className="file-item-btn" 
                        onClick={() => handleFileSelectOnly(file.name)}
                        title="Ver solo este archivo"
                      >
                        <span className="material-icons-round file-icon">insert_drive_file</span>
                        <div className="file-details">
                          <span className="file-name" title={file.name}>{file.name}</span>
                          <div className="file-meta">
                            <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                });
              })()
            }
          </div>
        </div>
        
        <div className="sidebar-section drag-drop-section">
          <div className="section-title"><span>ANALIZAR OTROS ARCHIVOS</span></div>
          <div className="drop-zone" onClick={() => document.getElementById('file-input')?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('hover'); }}
            onDragLeave={e => e.currentTarget.classList.remove('hover')}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('hover'); if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]); }}>
            <span className="material-icons-round drop-icon">cloud_upload</span>
            <p>Suelte archivos .log o .txt aquí</p>
            <span className="drop-subtext">o haz clic para explorar</span>
            <input type="file" id="file-input" accept=".log,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleFileUpload(e.target.files[0]); }} />
          </div>
        </div>

        {/* Sidebar Rules Section */}
        <div className="sidebar-section" style={{ flex: '0 0 auto', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <div className="section-title">
            <span>REGLAS DE ALERTA QA</span>
            <button className="icon-button" title="Editar JSON" onClick={openRulesModal}>
              <span className="material-icons-round">edit</span>
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {rules.map(rule => (
              <div 
                key={rule.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.15)',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={rule.pattern}>
                    {rule.pattern}
                  </span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                    Elevar a {rule.targetLevel}
                  </span>
                </div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={rule.enabled} 
                    onChange={() => {
                      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                    }} 
                  />
                  <span className="slider"></span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Persisted & Unified Pinned list */}
        {pinnedKeys.size > 0 && (
          <div className="sidebar-section pinned-section">
            <div className="section-title">
              <span>LOGS FIJADOS ({pinnedKeys.size})</span>
              <button 
                className="icon-button compact-btn" 
                title="Limpiar todos los pines"
                onClick={() => {
                  setPinnedKeys(new Set());
                  localStorage.removeItem('pinnedKeys');
                }}
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>delete_sweep</span>
              </button>
            </div>
            <div className="pinned-list">
              {Array.from(pinnedKeys).map(key => {
                const [originFile, originalIdStr] = key.split('::');
                const originalId = parseInt(originalIdStr, 10);
                const log = parsedLogs.find(l => l.originFile === originFile && l.originalId === originalId);
                if (!log) {
                  return (
                    <div key={key} className="pinned-item" style={{ opacity: 0.5 }}>
                      <div className="pinned-item-header">
                        <span className="pinned-badge" style={{ color: 'var(--text-muted)' }}>INACTIVO</span>
                        <button 
                          className="pinned-remove-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setPinnedKeys(prev => {
                              const next = new Set(prev);
                              next.delete(key);
                              localStorage.setItem('pinnedKeys', JSON.stringify(Array.from(next)));
                              return next;
                            });
                          }}
                        >
                          <span className="material-icons-round">close</span>
                        </button>
                      </div>
                      <div className="pinned-msg" title={`Archivo: ${originFile}`}>{originFile} (No seleccionado)</div>
                    </div>
                  );
                }

                const lc = LEVEL_META[log.level]?.color || '200, 10%, 50%';
                const time = log.timestamp.split(' ')[1] || log.timestamp;
                const shortMsg = log.message.trim().slice(0, 45) + (log.message.length > 45 ? '...' : '');
                return (
                  <div 
                    key={key} 
                    className={`pinned-item level-${log.level.toLowerCase()}`}
                    onClick={() => {
                      setActiveLog(log);
                      setIsDrawerOpen(true);
                      setTimeout(() => {
                        const row = document.getElementById(`log-row-${log.id}`);
                        if (row) {
                          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 100);
                    }}
                  >
                    <div className="pinned-item-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                        {log.originFile && (
                          <span className="pinned-badge" style={{ fontSize: '8px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50px' }}>
                            {log.originFile}
                          </span>
                        )}
                        <span className="pinned-badge" style={{ color: `hsl(${lc})`, background: `hsla(${lc},0.1)` }}>{log.level}</span>
                      </div>
                      <span className="pinned-time">{time}</span>
                      <button 
                        className="pinned-remove-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(log);
                        }}
                      >
                        <span className="material-icons-round">close</span>
                      </button>
                    </div>
                    <div className="pinned-msg" title={log.message}>{shortMsg}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="theme-toggle-container">
            <button className="theme-toggle-btn" onClick={() => setTheme(t => t === 'dark-theme' ? 'light-theme' : 'dark-theme')}>
              <span className="material-icons-round sun-icon">light_mode</span>
              <span className="material-icons-round moon-icon">dark_mode</span>
              <span className="theme-text">{theme === 'dark-theme' ? 'Tema Oscuro' : 'Tema Claro'}</span>
            </button>
          </div>
          <div className="system-stats"><span className="system-status active"></span><span>Conectado a Logs</span></div>
        </div>
      </aside>

      <main className="main-content">
        <section className="dashboard-grid">
          {KPI_CARDS.map((card, i) => (
            <div key={i} className={`kpi-card gradient-${card.cls}`}>
              <div className="card-icon"><span className="material-icons-round">{card.icon}</span></div>
              <div className="card-info">
                <span className="card-label">{card.label}</span>
                <h2>{card.value}</h2>
                <span className="card-subtext">{card.sub}</span>
              </div>
            </div>
          ))}
        </section>

        {parsedLogs.length > 0 && activeTab === 'feed' && (
          <section className="distribution-section">
            <div className="distribution-header">
              <span>DISTRIBUCIÓN POR NIVELES</span>
              <div className="distribution-legend">
                {distribution.map(d => (
                  <div key={d.level} className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: `hsl(${LEVEL_META[d.level]?.color || '0,0%,50%'})` }}></div>
                    <span>{d.level}: <b>{d.count}</b></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="distribution-bar">
              {distribution.length === 0 ? <div className="empty-bar-msg">Sin datos para la selección actual</div>
              : distribution.map(d => {
                const pct = ((d.count / filteredLogs.length) * 100).toFixed(1);
                return <div key={d.level} className="dist-segment" style={{ width: `${pct}%`, backgroundColor: `hsl(${LEVEL_META[d.level]?.color || '0,0%,50%'})` }} data-tooltip={`${d.level}: ${d.count} (${pct}%)`} onClick={() => { const s = new Set<LogLevel>(); s.add(d.level); setFilters(p => ({ ...p, activeLevels: s })); setCurrentPage(1); }} />;
              })}
            </div>
          </section>
        )}

        {parsedLogs.length > 0 && activeTab === 'feed' && (
          <section className="filter-panel">
            {filters.correlationId && (
              <div className="flow-isolation-banner">
                <span className="material-icons-round text-accent">insights</span>
                <span>Aislamiento de Flujo Activo: <code>{filters.correlationId}</code></span>
                <button className="secondary-button compact-btn" onClick={() => setFilters(p => ({ ...p, correlationId: null }))}>
                  <span className="material-icons-round" style={{ fontSize: 14 }}>close</span> Restablecer Vista
                </button>
              </div>
            )}
            <div className="filter-row search-row">
              <div className="search-input-wrapper">
                <span className="material-icons-round search-icon">search</span>
                <input type="text" id="search-input" placeholder="Buscar por método, mensaje, IP, ID de correlación o payload..." value={filters.searchTerm}
                  onChange={e => { setFilters(p => ({ ...p, searchTerm: e.target.value })); setCurrentPage(1); }} />
                {filters.searchTerm && <button className="clear-search-btn" onClick={() => { setFilters(p => ({ ...p, searchTerm: '' })); setCurrentPage(1); }}><span className="material-icons-round">close</span></button>}
              </div>
              <div className="search-options">
                <button className={`option-pill ${filters.isRegexSearch ? 'active' : ''}`} onClick={() => { setFilters(p => ({ ...p, isRegexSearch: !p.isRegexSearch })); setCurrentPage(1); }}>RegEx</button>
                <button className={`option-pill ${filters.isPayloadsOnly ? 'active' : ''}`} onClick={() => { setFilters(p => ({ ...p, isPayloadsOnly: !p.isPayloadsOnly })); setCurrentPage(1); }}>Con Payloads</button>
              </div>
            </div>
            <div className="filter-row control-row">
              <div className="level-pills">
                <span className="filter-group-label">NIVEL:</span>
                <button className={`option-pill level-all-pill ${filters.activeLevels.size === LOG_LEVELS.length ? 'active' : ''}`}
                  onClick={() => { setFilters(p => ({ ...p, activeLevels: defaultLevels() })); setCurrentPage(1); }}><span>TODOS</span></button>
                {LOG_LEVELS.map(level => {
                  const active = filters.activeLevels.has(level);
                  return <button key={level} className={`level-pill level-${level.toLowerCase()}-pill ${active ? 'active' : ''}`}
                    onClick={() => handleLevelClick(level)}>{level}</button>;
                })}
              </div>
              <div className="dropdown-filters">
                <div className="select-wrapper">
                  <span className="material-icons-round select-icon">filter_alt</span>
                  <select value={filters.activeService} onChange={e => { setFilters(p => ({ ...p, activeService: e.target.value })); setCurrentPage(1); }}>
                    <option value="ALL">Todos los Servicios</option>
                    {uniqueServices.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="date-filter-group">
                  <span className="material-icons-round date-filter-icon">date_range</span>
                  <label className="filter-group-label" htmlFor="date-from">Desde:</label>
                  <input type="datetime-local" id="date-from" className="date-input" value={filters.dateFrom ? toLocalISOString(filters.dateFrom) : ''}
                    onChange={e => { setFilters(p => ({ ...p, dateFrom: e.target.value ? new Date(e.target.value) : null })); setCurrentPage(1); }} />
                  <label className="filter-group-label" htmlFor="date-to">Hasta:</label>
                  <input type="datetime-local" id="date-to" className="date-input" value={filters.dateTo ? toLocalISOString(filters.dateTo) : ''}
                    onChange={e => { setFilters(p => ({ ...p, dateTo: e.target.value ? new Date(e.target.value) : null })); setCurrentPage(1); }} />
                  {(filters.dateFrom || filters.dateTo) && <button id="btn-clear-dates" className="secondary-button" onClick={() => { setFilters(p => ({ ...p, dateFrom: null, dateTo: null })); setCurrentPage(1); }}><span className="material-icons-round">close</span></button>}
                </div>
                <button id="btn-reset-filters" className="secondary-button" onClick={() => { setFilters({ activeLevels: defaultLevels(), activeService: 'ALL', searchTerm: '', isRegexSearch: false, isPayloadsOnly: false, dateFrom: null, dateTo: null, correlationId: null }); setSortColumn(null); setSortDirection('asc'); setCurrentPage(1); }}>
                  <span className="material-icons-round">restart_alt</span> Reestablecer
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="logs-feed-section">
          {/* Tab switches for Feed vs Metrics */}
          <div className="tab-container">
            <button 
              className={`tab-btn ${activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => setActiveTab('feed')}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>feed</span>
              Feed de Logs
            </button>
            <button 
              className={`tab-btn ${activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('metrics')}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>insights</span>
              Salud y Analíticas QA
            </button>
            <button 
              className="tab-btn" 
              style={{ marginLeft: 'auto', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.25)', color: '#f59e0b', borderRadius: '4px' }}
              onClick={openRulesModal}
            >
              <span className="material-icons-round" style={{ fontSize: '15px' }}>rule</span>
              Reglas de Alerta QA
            </button>
          </div>

          {activeTab === 'feed' ? (
            <>
              <div className="feed-header">
                <div className="feed-info">
                  <span className="material-icons-round">wysiwyg</span>
                  <span>{filteredLogs.length > 0 ? `Visualizando ${filteredLogs.length === parsedLogs.length ? `${filteredLogs.length} registros` : `${filteredLogs.length} de ${parsedLogs.length} registros (filtrado)`}` : 'Visualizando 0 registros'}</span>
                </div>
                <div className="feed-actions">
                  <label className="toggle-switch">
                    <input type="checkbox" defaultChecked onChange={e => document.getElementById('feed-viewport')?.classList.toggle('wrap-lines', e.target.checked)} />
                    <span className="slider"></span>
                    <span className="toggle-label">Ajustar líneas</span>
                  </label>
                </div>
              </div>
              <div className="feed-viewport" id="feed-viewport">
                {filteredLogs.length === 0 ? (
                  <div className="zero-state">
                    <span className="material-icons-round zero-icon">{parsedLogs.length === 0 ? 'insert_drive_file' : 'search_off'}</span>
                    <h3>{parsedLogs.length === 0 ? 'Ningún Archivo Seleccionado' : 'No se encontraron registros'}</h3>
                    <p>{parsedLogs.length === 0 ? 'Por favor, selecciona un archivo de log de la barra lateral o arrastra uno nuevo aquí para analizarlo.' : 'Ningún log coincide con tus filtros o término de búsqueda.'}</p>
                  </div>
                ) : (
                  <table className="logs-table">
                    <thead>
                      <tr>
                        <th width="4%" className="pin-header">Pin</th>
                        {(['timestamp', 'level', 'service', 'correlationId', 'message'] as const).map(col => (
                          <th key={col} width={col === 'timestamp' ? '14%' : col === 'level' ? '12%' : col === 'service' ? '16%' : col === 'correlationId' ? '14%' : '40%'}
                            className={`sortable-th ${sortColumn === col ? 'sort-active' : ''}`} data-sort-key={col}
                            onClick={() => {
                              if (sortColumn === col) {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortColumn(col);
                                setSortDirection('asc');
                              }
                              setCurrentPage(1);
                            }}>
                            {{ timestamp: 'Marca de Tiempo', level: 'Nivel', service: 'Servicio / Método', correlationId: 'ID Correlación', message: 'Mensaje / Contenido' }[col]}
                            <span className="sort-indicator">{sortColumn === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageLogs.map(log => {
                        const lc = LEVEL_META[log.level]?.color || '200, 10%, 50%';
                        const dateFormatted = log.timestamp.split(',')[0];
                        const snippet = log.message.trim().replace(/\s+/g, ' ').slice(0, 120) + (log.message.length > 120 ? '...' : '');
                        const isPinned = pinnedKeys.has(`${log.originFile || 'upload'}::${log.originalId || log.id}`);
                        const isFocused = focusedIndex === pageStart + pageLogs.indexOf(log);
                        
                        return (
                          <tr 
                            key={log.id} 
                            id={`log-row-${log.id}`} 
                            className={`${activeLog?.id === log.id ? 'active-row' : ''} ${isPinned ? 'pinned-row' : ''} ${isFocused ? 'keyboard-focused' : ''}`}
                            onClick={() => { 
                              setFocusedIndex(pageStart + pageLogs.indexOf(log));
                              setActiveLog(log); 
                              setIsDrawerOpen(true); 
                            }}
                          >
                            <td onClick={(e) => {
                              e.stopPropagation();
                              togglePin(log);
                            }}>
                              <span className={`material-icons-round pin-icon ${isPinned ? 'active' : ''}`} title={isPinned ? "Quitar marcador" : "Fijar log (Marcador)"}>
                                {isPinned ? 'push_pin' : 'push_pin'}
                              </span>
                            </td>
                            <td>
                              <div className="timestamp-cell">
                                <span className="log-timestamp">{dateFormatted}</span>
                                {log.deltaTimeMs !== undefined && (
                                  <span className={`latency-badge ${log.deltaTimeMs > 5000 ? 'latency-danger' : log.deltaTimeMs > 1000 ? 'latency-warning' : 'latency-normal'}`} title={`Tiempo desde el log anterior del mismo flujo: ${log.deltaTimeMs}ms`}>
                                    +{log.deltaTimeMs >= 1000 ? `${(log.deltaTimeMs / 1000).toFixed(2)}s` : `${log.deltaTimeMs}ms`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                {log.originFile && isMultiFileActive && (
                                  <span 
                                    className="file-origin-badge" 
                                    style={getFileColorStyle(log.originFile)}
                                    title={log.originFile}
                                  >
                                    {log.originFile}
                                  </span>
                                )}
                                {log.customBadge && (
                                  <span className="promotion-badge" title="Severidad de nivel elevada por regla de alerta QA">
                                    <span className="material-icons-round" style={{ fontSize: '10px' }}>notification_important</span>
                                    {log.customBadge}
                                  </span>
                                )}
                                <span className="badge badge-outline" style={{ color: `hsl(${lc})`, borderColor: `hsla(${lc},0.4)`, background: `hsla(${lc},0.08)` }}>{log.level}</span>
                              </div>
                            </td>
                            <td><div className="badge badge-service" title={log.service}>{log.service}</div></td>
                            <td>
                              {log.correlationId !== '-' ? (
                                <div className="correlation-cell">
                                  <span className="badge badge-correlation" title={log.correlationId}>{log.correlationId}</span>
                                  <button 
                                    className="icon-button trace-flow-btn" 
                                    title="Aislar flujo de esta petición"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFilters(p => ({ ...p, correlationId: log.correlationId }));
                                      setCurrentPage(1);
                                    }}
                                  >
                                    <span className="material-icons-round" style={{ fontSize: 13 }}>filter_alt</span>
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                            <td><div className="log-message-cell">{highlightText(snippet, filters.searchTerm, filters.isRegexSearch)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="feed-footer">
                <div className="pagination-info">{filteredLogs.length === 0 ? 'Mostrando registros 0-0' : `Mostrando registros ${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, filteredLogs.length)} de ${filteredLogs.length}`}</div>
                <div className="pagination-buttons">
                  <button id="btn-prev-page" className="secondary-button" disabled={currentPage <= 1} onClick={() => { setCurrentPage(p => p - 1); document.getElementById('feed-viewport')?.scrollTo(0, 0); }}>
                    <span className="material-icons-round">chevron_left</span> Anterior
                  </button>
                  <span className="page-indicator">Página {currentPage} de {totalPages}</span>
                  <button id="btn-next-page" className="secondary-button" disabled={currentPage >= totalPages} onClick={() => { setCurrentPage(p => p + 1); document.getElementById('feed-viewport')?.scrollTo(0, 0); }}>
                    Siguiente <span className="material-icons-round">chevron_right</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="feed-viewport" style={{ padding: '20px' }}>
              <AnalyticsDashboard 
                logs={filteredLogs}
                onSelectCorrelationId={(cid) => {
                  setFilters(p => ({ ...p, correlationId: cid }));
                  setActiveTab('feed');
                  setCurrentPage(1);
                }}
                onSelectService={(service) => {
                  setFilters(p => ({ ...p, activeService: service }));
                  setActiveTab('feed');
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </section>
      </main>

      {isDrawerOpen && activeLog && (
        <>
          <div className="details-overlay active" onClick={() => setIsDrawerOpen(false)}></div>
          <aside className="details-drawer active">
            <div className="drawer-header">
              <div className="drawer-title-area">
                <span className="material-icons-round drawer-icon">segment</span>
                <h2>Detalle del Registro</h2>
              </div>
              <div className="drawer-header-actions">
                <button 
                  className={`icon-button pin-drawer-btn ${pinnedKeys.has(`${activeLog.originFile || 'upload'}::${activeLog.originalId || activeLog.id}`) ? 'active' : ''}`} 
                  title={pinnedKeys.has(`${activeLog.originFile || 'upload'}::${activeLog.originalId || activeLog.id}`) ? "Quitar marcador" : "Fijar log (Marcador)"}
                  onClick={() => togglePin(activeLog)}
                >
                  <span className="material-icons-round">push_pin</span>
                </button>
                <button id="btn-close-drawer" className="icon-button" onClick={() => setIsDrawerOpen(false)}><span className="material-icons-round">close</span></button>
              </div>
            </div>
            <div className="drawer-body">
              <div className="drawer-meta-grid">
                <div className="meta-field">
                  <span className="meta-label">ID Registro</span>
                  <span className="meta-value">#{activeLog.id}</span>
                </div>
                <div className="meta-field">
                  <span className="meta-label">Nivel</span>
                  <span className="meta-value">
                    <span className="badge" style={{ background: `hsla(${LEVEL_META[activeLog.level]?.color || '0,0%,50%'},0.12)`, color: `hsl(${LEVEL_META[activeLog.level]?.color || '0,0%,50%'})` }}>{activeLog.level}</span>
                  </span>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Marca de Tiempo</span>
                  <span className="meta-value">{activeLog.timestamp}</span>
                </div>
                {activeLog.deltaTimeMs !== undefined && (
                  <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                    <span className="meta-label">Latencia (Delta)</span>
                    <span className={`meta-value latency-value ${activeLog.deltaTimeMs > 5000 ? 'latency-danger' : activeLog.deltaTimeMs > 1000 ? 'latency-warning' : 'latency-normal'}`}>
                      +{activeLog.deltaTimeMs >= 1000 ? `${(activeLog.deltaTimeMs / 1000).toFixed(2)}s` : `${activeLog.deltaTimeMs}ms`} (desde log previo del mismo flujo)
                    </span>
                  </div>
                )}
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Servicio o Método</span>
                  <span className="meta-value meta-value-accent">{activeLog.service}</span>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">ID de Correlación</span>
                  <div className="correlation-drawer-value">
                    <span className="meta-value meta-value-mono">{activeLog.correlationId}</span>
                    {activeLog.correlationId !== '-' && (
                      <button 
                        className="secondary-button compact-btn"
                        title="Aislar este flujo de peticiones"
                        onClick={() => {
                          setFilters(p => ({ ...p, correlationId: activeLog.correlationId }));
                          setCurrentPage(1);
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: 13 }}>filter_alt</span> Aislar Flujo
                      </button>
                    )}
                  </div>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Clase / Origen</span>
                  <span className="meta-value" title={activeLog.className}>{activeLog.className}</span>
                </div>
                <div className="meta-field" style={{ gridColumn: 'span 2' }}>
                  <span className="meta-label">Hilo de Ejecución</span>
                  <span className="meta-value meta-value-mono">{activeLog.thread}</span>
                </div>
              </div>

              {(() => {
                const isInCompareQueue = compareQueue.some(c => c.id === activeLog.id);
                return (
                  <div className="drawer-actions-row">
                    <button 
                      className={`secondary-button compare-action-btn ${isInCompareQueue ? 'active' : ''}`}
                      disabled={!isInCompareQueue && compareQueue.length >= 2}
                      onClick={() => {
                        setCompareQueue(prev => {
                          const exists = prev.some(c => c.id === activeLog.id);
                          if (exists) {
                            return prev.filter(c => c.id !== activeLog.id);
                          } else {
                            if (prev.length >= 2) return prev;
                            return [...prev, activeLog];
                          }
                        });
                      }}
                    >
                      <span className="material-icons-round">
                        {isInCompareQueue ? 'remove_done' : 'compare_arrows'}
                      </span>
                      <span>{isInCompareQueue ? 'Quitar de Comparar' : 'Agregar a Comparar'}</span>
                    </button>
                    <button className="primary-button export-md-btn" onClick={() => handleExportMarkdown(activeLog)}>
                      <span className="material-icons-round">{exportSuccess ? 'done' : 'bug_report'}</span>
                      <span>{exportSuccess ? '¡Copiado a Reporte!' : 'Exportar para Reporte (Markdown)'}</span>
                    </button>
                  </div>
                );
              })()}

              {activeDiagnosis && (
                <div className="diagnosis-box">
                  <div className="diagnosis-header"><span className="material-icons-round">psychology</span><span>LogScope Diagnóstico del Error</span></div>
                  <div className="diagnosis-body" dangerouslySetInnerHTML={{ __html: activeDiagnosis }} />
                </div>
              )}

              {(() => {
                const payload = formatPayload(activeLog.message);
                if (payload.kind === 'none') return null;
                
                let payloadContent = payload.kind === 'xml' ? highlightXml(payload.formatted || '') : highlightJson(payload.formatted || '');
                if (filters.searchTerm) {
                  payloadContent = highlightHtmlText(payloadContent, filters.searchTerm, filters.isRegexSearch);
                }
                
                return (
                  <div>
                    <div className="drawer-section-title">
                      <span>{payload.title}</span>
                      <button className="secondary-button copy-btn" onClick={() => copyText(payload.formatted || '')}>
                        <span className="material-icons-round" style={{ fontSize: 12 }}>content_copy</span> Copiar
                      </button>
                    </div>
                    {payload.prefix && <div className="payload-prefix">{escapeHtml(payload.prefix)}</div>}
                    <pre className="text-area-box formatted-box" dangerouslySetInnerHTML={{ __html: payloadContent }} />
                    {payload.suffix && <div className="payload-suffix">{escapeHtml(payload.suffix)}</div>}
                  </div>
                );
              })()}

              <details className="raw-details">
                <summary className="drawer-section-title" style={{ cursor: 'pointer' }}>
                  <span>Mensaje del Registro (Crudo)</span>
                  <button className="secondary-button copy-btn" onClick={e => { e.preventDefault(); e.stopPropagation(); copyText(activeLog.message); }}>
                    <span className="material-icons-round" style={{ fontSize: 12 }}>content_copy</span> Copiar
                  </button>
                </summary>
                <div className="text-area-box raw-box">{escapeHtml(activeLog.message)}</div>
              </details>
            </div>
          </aside>
        </>
      )}

      {compareQueue.length > 0 && (
        <div className="floating-compare-bar">
          <div className="compare-bar-content">
            <span className="material-icons-round compare-bar-icon">compare_arrows</span>
            <span className="compare-bar-text">
              Comparar Logs: <b>{compareQueue.length}/2</b> seleccionados
            </span>
            <div className="compare-bar-items">
              {compareQueue.map(item => (
                <span key={item.id} className="compare-pill">
                  #{item.id} <span className="pinned-badge" style={{ color: `hsl(${LEVEL_META[item.level]?.color || '0,0%,50%'})`, background: `hsla(${LEVEL_META[item.level]?.color || '0,0%,50%'},0.1)` }}>{item.level}</span>
                  <button className="remove-pill-btn" onClick={() => setCompareQueue(prev => prev.filter(c => c.id !== item.id))}>
                    <span className="material-icons-round">close</span>
                  </button>
                </span>
              ))}
            </div>
            <div className="compare-bar-actions">
              <button 
                className="primary-button compact-btn compare-run-btn" 
                disabled={compareQueue.length < 2}
                onClick={() => setIsCompareModalOpen(true)}
                title={compareQueue.length < 2 ? "Selecciona 2 logs para comparar" : "Ver comparación lado a lado"}
              >
                <span className="material-icons-round">difference</span> Comparar
              </button>
              <button className="secondary-button compact-btn" onClick={() => setCompareQueue([])}>
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {isCompareModalOpen && compareQueue.length === 2 && (
        <div className="compare-modal-overlay">
          <div className="compare-modal">
            <div className="compare-modal-header">
              <div className="compare-modal-title">
                <span className="material-icons-round">difference</span>
                <h2>Comparador de Payloads Lado a Lado</h2>
              </div>
              <button className="icon-button" onClick={() => setIsCompareModalOpen(false)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="compare-modal-meta">
              <div className="compare-meta-left">
                <span className="meta-label">Log Izquierda (Log A)</span>
                <div className="compare-meta-val">
                  <span className="badge" style={{ color: `hsl(${LEVEL_META[compareQueue[0].level]?.color || '0,0%,50%'})`, background: `hsla(${LEVEL_META[compareQueue[0].level]?.color || '0,0%,50%'},0.1)` }}>{compareQueue[0].level}</span>
                  <span>ID: <b>#{compareQueue[0].id}</b></span>
                  <span>• <b>{compareQueue[0].service}</b></span>
                </div>
              </div>
              <div className="compare-modal-meta-center">
                <span className="material-icons-round">swap_horiz</span>
              </div>
              <div className="compare-meta-right">
                <span className="meta-label">Log Derecha (Log B)</span>
                <div className="compare-meta-val">
                  <span className="badge" style={{ color: `hsl(${LEVEL_META[compareQueue[1].level]?.color || '0,0%,50%'})`, background: `hsla(${LEVEL_META[compareQueue[1].level]?.color || '0,0%,50%'},0.1)` }}>{compareQueue[1].level}</span>
                  <span>ID: <b>#{compareQueue[1].id}</b></span>
                  <span>• <b>{compareQueue[1].service}</b></span>
                </div>
              </div>
            </div>
            <div className="compare-modal-body">
              {(() => {
                const payloadA = formatPayload(compareQueue[0].message);
                const payloadB = formatPayload(compareQueue[1].message);
                const textA = payloadA.formatted || compareQueue[0].message;
                const textB = payloadB.formatted || compareQueue[1].message;
                const { left, right } = computeDiff(textA, textB);
                
                return (
                  <div className="diff-container">
                    <div className="diff-column diff-column-left" ref={leftRef} onScroll={handleLeftScroll}>
                      <pre className="diff-pre">
                        {left.map((line, idx) => (
                          <div key={idx} className={`diff-line-wrapper diff-${line.type}`}>
                            <span className="diff-line-number">{line.value !== '' ? idx + 1 : ''}</span>
                            <span className="diff-line-sign">{line.type === 'removed' ? '-' : ' '}</span>
                            <span className="diff-line-content">{line.value}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                    <div className="diff-column diff-column-right" ref={rightRef} onScroll={handleRightScroll}>
                      <pre className="diff-pre">
                        {right.map((line, idx) => (
                          <div key={idx} className={`diff-line-wrapper diff-${line.type}`}>
                            <span className="diff-line-number">{line.value !== '' ? idx + 1 : ''}</span>
                            <span className="diff-line-sign">{line.type === 'added' ? '+' : ' '}</span>
                            <span className="diff-line-content">{line.value}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {isRulesModalOpen && (
        <div className="compare-modal-overlay" style={{ zIndex: 300 }}>
          <div className="compare-modal" style={{ maxWidth: '600px', maxHeight: '550px' }}>
            <div className="compare-modal-header">
              <div className="compare-modal-title">
                <span className="material-icons-round">rule</span>
                <h2>Editor de Reglas de Alerta QA</h2>
              </div>
              <button className="icon-button" onClick={() => setIsRulesModalOpen(false)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="compare-modal-meta" style={{ display: 'block', padding: '12px 20px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Define reglas para elevar automáticamente la severidad de los logs silenciosos (ej. DEBUG, INFO) a niveles críticos (ej. WARN, ERROR) cuando contienen ciertos patrones de texto.
              </p>
            </div>
            <div className="compare-modal-body" style={{ flexDirection: 'column', padding: '16px', gap: '12px', background: 'var(--bg-panel)' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className="meta-label">Configuración en JSON</span>
                <textarea 
                  value={rulesJsonInput}
                  onChange={e => setRulesJsonInput(e.target.value)}
                  style={{
                    flex: 1,
                    width: '100%',
                    background: '#151515',
                    color: '#d4d4d4',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    padding: '10px',
                    resize: 'none'
                  }}
                />
                {jsonError && (
                  <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 600 }}>
                    ⚠️ {jsonError}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <button 
                  className="secondary-button" 
                  onClick={() => {
                    setRulesJsonInput(JSON.stringify(DEFAULT_RULES, null, 2));
                    setJsonError(null);
                  }}
                >
                  Restablecer por defecto
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="secondary-button" onClick={() => setIsRulesModalOpen(false)}>
                    Cancelar
                  </button>
                  <button className="primary-button" onClick={handleSaveRulesJson}>
                    Guardar Reglas
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
