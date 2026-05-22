import { useEffect, useMemo, useState, useCallback } from 'react';
import { parseLogs, defaultLevels } from '../../domain/parsing/parseLogs';
import { applyFilters, FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { buildStats, buildDistribution } from '../../application/usecases/buildStats';
import { fetchFileContent, fetchFiles, LogFileMeta } from '../../infrastructure/api/filesApi';
import { LogEntry, LogLevel } from '../../domain/models/LogEntry';
import { PromotionRule, DEFAULT_RULES } from '../../domain/models/PromotionRule';
import { calculateDeltas } from '../../domain/parsing/calculateDeltas';
import { runDiagnosis } from '../../domain/parsing/runDiagnosis';
import { parseTimestamp } from '../../domain/parsing/parseTimestamp';
import { ParserConfig, DEFAULT_PARSERS } from '../../domain/models/ParserConfig';

const PAGE_SIZE = 200;

export function useLogViewerState() {
  const [files, setFiles] = useState<LogFileMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    activeLevels: defaultLevels(),
    activeService: 'ALL',
    searchTerm: '',
    isRegexSearch: false,
    isPayloadsOnly: false,
    dateFrom: null,
    dateTo: null,
    correlationId: null,
    quickFilter: 'NONE'
  });
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeLog, setActiveLog] = useState<LogEntry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark-theme');
  const [wrapLines, setWrapLines] = useState<boolean>(() => {
    return localStorage.getItem('wrapLines') !== 'false';
  });

  // Upgrades premium states
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'feed' | 'metrics'>('feed');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
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

  const [parsers, setParsers] = useState<ParserConfig[]>(() => {
    try {
      const saved = localStorage.getItem('logParsers');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error loading parsers from localStorage", e);
    }
    return DEFAULT_PARSERS;
  });
  const [isParserModalOpen, setIsParserModalOpen] = useState(false);

  // Sync parsers
  useEffect(() => {
    localStorage.setItem('logParsers', JSON.stringify(parsers));
  }, [parsers]);

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
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Sync visual theme
  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Sync wrapLines
  useEffect(() => {
    localStorage.setItem('wrapLines', String(wrapLines));
  }, [wrapLines]);

  // Sync rules
  useEffect(() => {
    localStorage.setItem('promotionRules', JSON.stringify(rules));
  }, [rules]);

  // Load and merge logic
  const loadAndMergeFiles = useCallback(async (fileNames: string[], uploaded: Record<string, string>, currentRules: PromotionRule[], activeParsers: ParserConfig[]) => {
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
        const parsed = parseLogs(content, activeParsers);
        parsed.forEach(entry => {
          entry.originFile = name;
          entry.originalId = entry.id; // Preserve original file ID
        });
        allEntries = allEntries.concat(parsed);
      });

      // 3. Apply promotion rules
      allEntries.forEach(entry => {
        for (const rule of currentRules) {
          if (rule.enabled && (entry.message || '').includes(rule.pattern)) {
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

      // Auto-activate all parsed levels (base + dynamic)
      const parsedUnique = withDeltas.map(l => l.level).filter(Boolean);
      const base = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
      const nextLevels = new Set([...base, ...parsedUnique]);
      setFilters(prev => ({ ...prev, activeLevels: nextLevels }));
    } catch (error) {
      console.error("Error loading and merging files:", error);
    }
  }, []);

  // Sync loaded logs when files, uploaded files, or rules change
  useEffect(() => {
    loadAndMergeFiles(selectedFiles, uploadedFiles, rules, parsers);
  }, [selectedFiles, uploadedFiles, rules, parsers, loadAndMergeFiles]);

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

  const availableLevels = useMemo(() => {
    const base = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
    const parsedUnique = parsedLogs.map(l => l.level).filter(Boolean);
    const set = new Set([...base, ...parsedUnique]);
    return Array.from(set);
  }, [parsedLogs]);

  const logDateRange = useMemo(() => {
    if (parsedLogs.length === 0) {
      return { min: null, max: null, minStr: '', maxStr: '' };
    }
    const firstLog = parsedLogs[0];
    const lastLog = parsedLogs[parsedLogs.length - 1];
    return {
      min: parseTimestamp(firstLog.timestamp),
      max: parseTimestamp(lastLog.timestamp),
      minStr: firstLog.timestamp,
      maxStr: lastLog.timestamp
    };
  }, [parsedLogs]);

  const filteredLogs = useMemo(() => applyFilters(parsedLogs, filters, sortColumn, sortDirection), [parsedLogs, filters, sortColumn, sortDirection]);
  const stats = useMemo(() => buildStats(parsedLogs), [parsedLogs]);
  const distribution = useMemo(() => buildDistribution(filteredLogs), [filteredLogs]);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageLogs = filteredLogs.slice(pageStart, pageStart + PAGE_SIZE);
  const activeDiagnosis = useMemo(() => activeLog ? runDiagnosis(activeLog.message) : null, [activeLog]);

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
    setFilters(p => ({
      ...p,
      activeService: 'ALL',
      searchTerm: '',
      isRegexSearch: false,
      isPayloadsOnly: false,
      dateFrom: null,
      dateTo: null,
      correlationId: null,
      activeLevels: defaultLevels(),
      quickFilter: 'NONE'
    }));
    setCurrentPage(1);
    setActiveLog(null);
    setIsDrawerOpen(false);
  }, []);

  const handleFileSelectOnly = useCallback((fileName: string) => {
    setSelectedFiles([fileName]);
    localStorage.setItem('selectedFiles', JSON.stringify([fileName]));
    localStorage.setItem('activeFileName', fileName);
    setFilters(p => ({
      ...p,
      activeService: 'ALL',
      searchTerm: '',
      isRegexSearch: false,
      isPayloadsOnly: false,
      dateFrom: null,
      dateTo: null,
      correlationId: null,
      activeLevels: defaultLevels(),
      quickFilter: 'NONE'
    }));
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
      setFilters(p => ({
        ...p,
        activeService: 'ALL',
        searchTerm: '',
        isRegexSearch: false,
        isPayloadsOnly: false,
        dateFrom: null,
        dateTo: null,
        correlationId: null,
        activeLevels: defaultLevels(),
        quickFilter: 'NONE'
      }));
      setSortColumn(null);
      setSortDirection('asc');
      setCurrentPage(1);
      setActiveLog(null);
      setIsDrawerOpen(false);
    };
    reader.readAsText(file);
  }, []);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Copy failed');
    }
  }, []);

  const handleLevelClick = useCallback((level: LogLevel) => {
    const activeSet = filters.activeLevels instanceof Set ? filters.activeLevels : defaultLevels();
    const isAllActive = activeSet.size === availableLevels.length;
    let newLevels: Set<LogLevel>;
    if (isAllActive) {
      newLevels = new Set([level]);
    } else {
      newLevels = new Set(activeSet);
      if (newLevels.has(level)) {
        newLevels.delete(level);
        if (newLevels.size === 0) {
          newLevels = new Set(availableLevels);
        }
      } else {
        newLevels.add(level);
      }
    }
    setFilters(p => ({ ...p, activeLevels: newLevels }));
    setCurrentPage(1);
  }, [filters.activeLevels, availableLevels]);

  const openRulesModal = useCallback(() => {
    setRulesJsonInput(JSON.stringify(rules, null, 2));
    setJsonError(null);
    setIsRulesModalOpen(true);
  }, [rules]);

  const handleSaveRulesJson = useCallback(() => {
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
  }, [rulesJsonInput]);

  const setRulesJsonInputToDefault = useCallback(() => {
    setRulesJsonInput(JSON.stringify(DEFAULT_RULES, null, 2));
    setJsonError(null);
  }, []);

  // Keyboard shortcut actions
  const handleSelectRow = useCallback((idx: number) => {
    const log = filteredLogs[idx];
    if (log) {
      setActiveLog(log);
      setIsDrawerOpen(true);
    }
  }, [filteredLogs]);

  const handlePinRow = useCallback((idx: number) => {
    const log = filteredLogs[idx];
    if (log) {
      togglePin(log);
    }
  }, [filteredLogs, togglePin]);

  const handleCompareRow = useCallback((idx: number) => {
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
  }, [filteredLogs]);

  const handleSearchFocus = useCallback(() => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.focus();
      (searchInput as HTMLInputElement).select();
    }
  }, []);

  const handleCloseAll = useCallback(() => {
    setIsDrawerOpen(false);
    setIsCompareModalOpen(false);
    setIsShortcutsModalOpen(false);
  }, []);

  const applyTimePreset = useCallback((minutes: number) => {
    if (parsedLogs.length === 0) return;
    const lastLog = parsedLogs[parsedLogs.length - 1];
    const newestDate = parseTimestamp(lastLog.timestamp);
    if (!newestDate) return;

    const dateTo = newestDate;
    const dateFrom = new Date(newestDate.getTime() - minutes * 60 * 1000);

    setFilters(p => ({
      ...p,
      dateFrom,
      dateTo
    }));
    setCurrentPage(1);
  }, [parsedLogs]);

  const applyFullDateRange = useCallback(() => {
    if (parsedLogs.length === 0) return;
    const firstLog = parsedLogs[0];
    const lastLog = parsedLogs[parsedLogs.length - 1];
    const minDate = parseTimestamp(firstLog.timestamp);
    const maxDate = parseTimestamp(lastLog.timestamp);

    setFilters(p => ({
      ...p,
      dateFrom: minDate,
      dateTo: maxDate
    }));
    setCurrentPage(1);
  }, [parsedLogs]);

  const exportSession = useCallback(() => {
    const safeActiveLevels = filters.activeLevels instanceof Set 
      ? filters.activeLevels 
      : new Set(filters.activeLevels || []);

    const sessionData = {
      version: '5.0',
      selectedFiles,
      uploadedFiles,
      filters: {
        ...filters,
        activeLevels: Array.from(safeActiveLevels),
        dateFrom: (() => {
          const d = filters.dateFrom ? (filters.dateFrom instanceof Date ? filters.dateFrom : new Date(filters.dateFrom)) : null;
          return d && !isNaN(d.getTime()) ? d.toISOString() : null;
        })(),
        dateTo: (() => {
          const d = filters.dateTo ? (filters.dateTo instanceof Date ? filters.dateTo : new Date(filters.dateTo)) : null;
          return d && !isNaN(d.getTime()) ? d.toISOString() : null;
        })(),
      },
      sortColumn,
      sortDirection,
      currentPage,
      rules,
      pinnedKeys: Array.from(pinnedKeys),
    };
    
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `logscope_session_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  }, [selectedFiles, uploadedFiles, filters, sortColumn, sortDirection, currentPage, rules, pinnedKeys]);

  const importSession = useCallback((jsonData: any) => {
    try {
      if (jsonData.selectedFiles) setSelectedFiles(jsonData.selectedFiles);
      if (jsonData.uploadedFiles) setUploadedFiles(jsonData.uploadedFiles);
      if (jsonData.rules) setRules(jsonData.rules);
      if (jsonData.pinnedKeys) {
        const nextPins = new Set<string>(jsonData.pinnedKeys);
        setPinnedKeys(nextPins);
        localStorage.setItem('pinnedKeys', JSON.stringify(Array.from(nextPins)));
      }
      if (jsonData.sortColumn !== undefined) setSortColumn(jsonData.sortColumn);
      if (jsonData.sortDirection) setSortDirection(jsonData.sortDirection);
      if (jsonData.currentPage) setCurrentPage(jsonData.currentPage);
      
      const parseImportedDate = (val: any): Date | null => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      if (jsonData.filters) {
        const activeLevels = Array.isArray(jsonData.filters.activeLevels)
          ? new Set<LogLevel>(jsonData.filters.activeLevels)
          : defaultLevels();
        const dateFrom = parseImportedDate(jsonData.filters.dateFrom);
        const dateTo = parseImportedDate(jsonData.filters.dateTo);
        
        setFilters({
          ...jsonData.filters,
          activeLevels,
          dateFrom,
          dateTo
        });
      }
      return true;
    } catch (e) {
      console.error("Error al importar la sesión:", e);
      return false;
    }
  }, []);

  return {
    files,
    loadingFiles,
    parsedLogs,
    filters,
    setFilters,
    sortColumn,
    setSortColumn,
    sortDirection,
    setSortDirection,
    currentPage,
    setCurrentPage,
    activeLog,
    setActiveLog,
    isDrawerOpen,
    setIsDrawerOpen,
    theme,
    setTheme,
    selectedFiles,
    setSelectedFiles,
    uploadedFiles,
    setUploadedFiles,
    activeTab,
    setActiveTab,
    isRulesModalOpen,
    setIsRulesModalOpen,
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
    rulesJsonInput,
    setRulesJsonInput,
    jsonError,
    setJsonError,
    rules,
    setRules,
    pinnedKeys,
    setPinnedKeys,
    togglePin,
    compareQueue,
    setCompareQueue,
    isCompareModalOpen,
    setIsCompareModalOpen,
    exportSuccess,
    setExportSuccess,
    focusedIndex,
    setFocusedIndex,
    uniqueServices,
    filteredLogs,
    stats,
    distribution,
    totalPages,
    pageStart,
    pageLogs,
    activeDiagnosis,
    handleFileCheckboxToggle,
    handleFileSelectOnly,
    handleFileUpload,
    copyText,
    handleLevelClick,
    openRulesModal,
    handleSaveRulesJson,
    setRulesJsonInputToDefault,
    handleSelectRow,
    handlePinRow,
    handleCompareRow,
    handleSearchFocus,
    handleCloseAll,
    wrapLines,
    setWrapLines,
    logDateRange,
    applyTimePreset,
    applyFullDateRange,
    exportSession,
    importSession,
    availableLevels,
    parsers,
    setParsers,
    isParserModalOpen,
    setIsParserModalOpen
  };
}
export type LogViewerState = ReturnType<typeof useLogViewerState>;
