import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { defaultLevels, parseLogs } from '../../domain/parsing/parseLogs';
import { applyFilters, FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { buildStats, buildDistribution } from '../../application/usecases/buildStats';
import { fetchFileContent, fetchFiles, LogFileMeta } from '../../infrastructure/api/filesApi';
import { LogEntry, LogLevel } from '../../domain/models/LogEntry';
import { PromotionRule, DEFAULT_RULES } from '../../domain/models/PromotionRule';
import { runDiagnosis } from '../../domain/parsing/runDiagnosis';
import { parseTimestamp } from '../../domain/parsing/parseTimestamp';
import { ParserConfig, DEFAULT_PARSERS } from '../../domain/models/ParserConfig';
import { useParseWorker } from './useParseWorker';
import { connectTail, disconnectTail } from '../../infrastructure/api/tailSocket';
import { connectFilesWatcher, disconnectFilesWatcher } from '../../infrastructure/api/filesSocket';
import { FilterPreset } from '../../domain/models/FilterPreset';


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

  const [viewMode, setViewMode] = useState<'virtual' | 'paginated'>(() => {
    return (localStorage.getItem('viewMode') as 'virtual' | 'paginated') || 'virtual';
  });

  // --- FASE 3: QA PREMIUM STATES ---
  // 1. Live Log Tailing states
  const [isTailing, setIsTailing] = useState(false);
  const [isTailPaused, setIsTailPaused] = useState(false);
  const [autoScrollTail, setAutoScrollTail] = useState(true);

  // 2. Presets of Filters states
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem('filterPresets');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading filterPresets', e);
    }
    return [];
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // 3. Annotations states
  const [annotations, setAnnotations] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('logAnnotations');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading logAnnotations', e);
    }
    return {};
  });


  const { isProcessing, progress, statusText, parseWithWorker } = useParseWorker();

  // --- FASE 4: PREMIUM DESKTOP ALERTS ---
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('desktopAlertsEnabled') === 'true';
  });

  const toggleDesktopAlerts = useCallback(() => {
    if (!desktopAlertsEnabled) {
      if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            setDesktopAlertsEnabled(true);
            localStorage.setItem('desktopAlertsEnabled', 'true');
          } else {
            alert("El permiso de notificaciones de escritorio fue rechazado.");
          }
        });
      } else {
        alert("Las notificaciones de escritorio no están soportadas en este navegador.");
      }
    } else {
      setDesktopAlertsEnabled(false);
      localStorage.setItem('desktopAlertsEnabled', 'false');
    }
  }, [desktopAlertsEnabled]);

  // Sync viewMode
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

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

  // Live WebSocket Tailing Synchronizer
  const activeTailFilename = selectedFiles[0] || null;

  useEffect(() => {
    if (isTailing && activeTailFilename && !isTailPaused) {
      connectTail(
        activeTailFilename,
        (line) => {
          const parsed = parseLogs(line, parsers);
          if (parsed.length > 0) {
            parsed.forEach(entry => {
              entry.originFile = activeTailFilename;
              entry.originalId = entry.id;
              
              // Apply severity promotion rules
              for (const rule of rules) {
                if (rule.enabled && (entry.message || '').includes(rule.pattern)) {
                  entry.level = rule.targetLevel;
                  entry.customBadge = rule.customBadge;
                  break;
                }
              }

              // Inject annotation if already exists
              const noteKey = `${entry.originFile}::${entry.originalId}`;
              if (annotations[noteKey]) {
                entry.annotation = annotations[noteKey];
              }

              // Trigger desktop notification if backgrounded and is critical severity or customBadge
              if (
                desktopAlertsEnabled &&
                document.visibilityState === 'hidden' &&
                (entry.level === 'ERROR' || entry.level === 'WARN' || entry.customBadge)
              ) {
                const title = `🚨 [${entry.level}] ${entry.service || 'Alerta LogScope'}`;
                const snippet = entry.message.slice(0, 120) + (entry.message.length > 120 ? '...' : '');
                const options = {
                  body: snippet,
                  icon: '/favicon.ico'
                };
                try {
                  const notification = new Notification(title, options);
                  notification.onclick = () => {
                    window.focus();
                  };
                } catch (e) {
                  console.error('Error triggering notification:', e);
                }
              }
            });

            setParsedLogs(prev => {
              parsed.forEach(entry => {
                const lastEntryWithSameCid = [...prev].reverse().find(e => e.correlationId === entry.correlationId && e.correlationId !== '-');
                if (lastEntryWithSameCid) {
                  const prevTime = parseTimestamp(lastEntryWithSameCid.timestamp);
                  const currTime = parseTimestamp(entry.timestamp);
                  if (prevTime && currTime) {
                    entry.deltaTimeMs = currTime.getTime() - prevTime.getTime();
                  }
                }
              });

              let next = [...prev, ...parsed];
              if (next.length > 50000) {
                next = next.slice(next.length - 50000);
              }
              // Re-index IDs consecutively
              next.forEach((item, idx) => {
                item.id = idx + 1;
              });
              return next;
            });
          }
        },
        (err) => {
          console.error('Tail WebSocket error callback:', err);
        }
      );
    } else {
      disconnectTail();
    }

    return () => {
      disconnectTail();
    };
  }, [isTailing, activeTailFilename, isTailPaused, parsers, rules, annotations]);


  // Load and merge logic using Web Worker
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

      // 2. Parse using the background Web Worker
      const withDeltas = await parseWithWorker(contents, currentRules, activeParsers);

      // Inject any existing comments / annotations on the main thread
      let savedAnnotations: Record<string, string> = {};
      try {
        const saved = localStorage.getItem('logAnnotations');
        if (saved) savedAnnotations = JSON.parse(saved);
      } catch {}

      withDeltas.forEach(entry => {
        const entryKey = `${entry.originFile || 'upload'}::${entry.originalId || entry.id}`;
        if (savedAnnotations[entryKey]) {
          entry.annotation = savedAnnotations[entryKey];
        }
      });

      setParsedLogs(withDeltas);

      // Auto-activate all parsed levels (base + dynamic)
      const parsedUnique = withDeltas.map(l => l.level).filter(Boolean);
      const base = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
      const nextLevels = new Set([...base, ...parsedUnique]);
      setFilters(prev => ({ ...prev, activeLevels: nextLevels }));
    } catch (error) {
      console.error("Error loading and merging files using worker:", error);
    }
  }, [parseWithWorker]);

  // Sync loaded logs when files, uploaded files, or rules change
  useEffect(() => {
    loadAndMergeFiles(selectedFiles, uploadedFiles, rules, parsers);
  }, [selectedFiles, uploadedFiles, rules, parsers, loadAndMergeFiles]);


  // Live folder sync via WebSocket
  useEffect(() => {
    connectFilesWatcher((updatedFiles) => {
      setFiles(updatedFiles);
    });
    return () => {
      disconnectFilesWatcher();
    };
  }, []);

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
  const pageLogs = useMemo(() => {
    if (viewMode === 'virtual') {
      return filteredLogs;
    }
    return filteredLogs.slice(pageStart, pageStart + PAGE_SIZE);
  }, [filteredLogs, viewMode, pageStart]);
  const activeDiagnosis = useMemo(() => activeLog ? runDiagnosis(activeLog.message) : null, [activeLog]);

  // Automatically navigate to the last page when tailing is active and new logs are appended
  useEffect(() => {
    if (isTailing && autoScrollTail && viewMode === 'paginated') {
      const latestPage = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
      if (currentPage !== latestPage) {
        setCurrentPage(latestPage);
      }
    }
  }, [filteredLogs.length, isTailing, autoScrollTail, viewMode, currentPage]);

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

  // --- FASE 3 PREMIUM ACTIONS ---
  
  // 1. Presets Actions
  const saveCurrentAsPreset = useCallback((name: string, icon: string) => {
    const safeLevels = filters.activeLevels instanceof Set 
      ? Array.from(filters.activeLevels) 
      : (filters.activeLevels || []);

    const newPreset: FilterPreset = {
      id: `preset_${Date.now()}`,
      name,
      icon,
      filters: {
        activeLevels: safeLevels,
        activeService: filters.activeService,
        searchTerm: filters.searchTerm,
        isRegexSearch: filters.isRegexSearch,
        isPayloadsOnly: filters.isPayloadsOnly,
        dateFrom: filters.dateFrom ? (filters.dateFrom instanceof Date ? filters.dateFrom.toISOString() : String(filters.dateFrom)) : null,
        dateTo: filters.dateTo ? (filters.dateTo instanceof Date ? filters.dateTo.toISOString() : String(filters.dateTo)) : null,
        quickFilter: filters.quickFilter
      },
      createdAt: new Date().toISOString()
    };

    setPresets(prev => {
      const next = [...prev, newPreset];
      localStorage.setItem('filterPresets', JSON.stringify(next));
      return next;
    });
    setActivePresetId(newPreset.id);
  }, [filters]);

  const applyPreset = useCallback((preset: FilterPreset) => {
    setActivePresetId(preset.id);
    
    const parsePresetDate = (val: any): Date | null => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    setFilters({
      activeLevels: new Set(preset.filters.activeLevels),
      activeService: preset.filters.activeService,
      searchTerm: preset.filters.searchTerm,
      isRegexSearch: preset.filters.isRegexSearch,
      isPayloadsOnly: preset.filters.isPayloadsOnly,
      dateFrom: parsePresetDate(preset.filters.dateFrom),
      dateTo: parsePresetDate(preset.filters.dateTo),
      correlationId: null,
      quickFilter: preset.filters.quickFilter
    });
    setCurrentPage(1);
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      localStorage.setItem('filterPresets', JSON.stringify(next));
      return next;
    });
    if (activePresetId === id) {
      setActivePresetId(null);
    }
  }, [activePresetId]);

  // 2. Log Annotations Actions
  const saveAnnotation = useCallback((log: LogEntry, text: string) => {
    const noteKey = `${log.originFile || 'upload'}::${log.originalId || log.id}`;

    setAnnotations(prev => {
      const next = { ...prev };
      if (text) {
        next[noteKey] = text;
      } else {
        delete next[noteKey];
      }
      localStorage.setItem('logAnnotations', JSON.stringify(next));
      return next;
    });

    // Atoms update state instantly
    setParsedLogs(prev => {
      return prev.map(entry => {
        const entryKey = `${entry.originFile || 'upload'}::${entry.originalId || entry.id}`;
        if (entryKey === noteKey) {
          return { ...entry, annotation: text || undefined };
        }
        return entry;
      });
    });
  }, []);


  const exportSession = useCallback(() => {
    const safeActiveLevels = filters.activeLevels instanceof Set 
      ? filters.activeLevels 
      : new Set(filters.activeLevels || []);

    const sessionData = {
      version: '8.0',
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
      annotations, // Persistent row-level comments included in export
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
  }, [selectedFiles, uploadedFiles, filters, sortColumn, sortDirection, currentPage, rules, pinnedKeys, annotations]);

  const downloadFilteredLogs = useCallback(() => {
    const rawContent = filteredLogs.map(l => l.raw || '').join('\n');
    const blob = new Blob([rawContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    a.download = `logscope_filtered_${dateStr}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredLogs]);


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

      if (jsonData.annotations) {
        setAnnotations(jsonData.annotations);
        localStorage.setItem('logAnnotations', JSON.stringify(jsonData.annotations));
        
        // Dynamic atomic update to restore comments in UI
        setParsedLogs(prev => {
          return prev.map(entry => {
            const entryKey = `${entry.originFile || 'upload'}::${entry.originalId || entry.id}`;
            if (jsonData.annotations[entryKey]) {
              return { ...entry, annotation: jsonData.annotations[entryKey] };
            }
            return entry;
          });
        });
      }

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
    setIsParserModalOpen,
    viewMode,
    setViewMode,
    isProcessing,
    progress,
    statusText,
    // Live Tailing
    isTailing,
    setIsTailing,
    isTailPaused,
    setIsTailPaused,
    autoScrollTail,
    setAutoScrollTail,
    // Presets
    presets,
    setPresets,
    activePresetId,
    setActivePresetId,
    saveCurrentAsPreset,
    applyPreset,
    deletePreset,
    // Annotations
    annotations,
    setAnnotations,
    saveAnnotation,
    // Fase 4 Upgrades
    desktopAlertsEnabled,
    toggleDesktopAlerts,
    downloadFilteredLogs
  };
}
export type LogViewerState = ReturnType<typeof useLogViewerState>;

