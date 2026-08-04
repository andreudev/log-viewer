import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { defaultLevels, parseLogs } from '../../domain/parsing/parseLogs';
import { applyFilters, FilterState, SortColumn, SortDirection } from '../../application/usecases/applyFilters';
import { buildStats, buildDistribution } from '../../application/usecases/buildStats';
import { fetchFileContent, fetchFiles, LogFileMeta, fetchSettings, saveSettings } from '../../infrastructure/api/filesApi';
import { LogEntry, LogLevel } from '../../domain/models/LogEntry';
import { PromotionRule, DEFAULT_RULES } from '../../domain/models/PromotionRule';
import { runDiagnosis } from '../../domain/parsing/runDiagnosis';
import { parseTimestamp } from '../../domain/parsing/parseTimestamp';
import { ParserConfig, DEFAULT_PARSERS } from '../../domain/models/ParserConfig';
import { useParseWorker } from './useParseWorker';
import { connectTail, disconnectTail } from '../../infrastructure/api/tailSocket';
import { connectFilesWatcher, disconnectFilesWatcher } from '../../infrastructure/api/filesSocket';
import { FilterPreset } from '../../domain/models/FilterPreset';
import { getLogsFromCache, saveLogsToCache } from '../../infrastructure/db/indexedDBHelper';


export interface SshConnectionConfig {
  id?: string;
  name: string;
  host: string;
  port?: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKeyContent?: string;
  privateKeyPath?: string;
  logDir?: string;
  sudoPassword?: string;
  hasPassword?: boolean;
  hasPrivateKey?: boolean;
  hasSudoPassword?: boolean;
}

export interface AnnotationDetail {
  text: string;
  timestamp: string;
  service: string;
  level: string;
  correlationId: string;
  message: string;
  originFile?: string;
  logId?: number;
}

const PAGE_SIZE = 200;

export function useLogViewerState(paneId: 'left' | 'right' = 'left') {
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
  /**
   * Restablece todos los filtros a su estado inicial. Usado por el botón
   * "Reset" en FiltersPanel y al cargar un nuevo archivo. Mantiene los
   * archivos seleccionados y la paginación también se reinicia a 1.
   */
  const resetFilters = useCallback(() => {
    setFilters({
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
    setSortColumn(null);
    setSortDirection('asc');
    setCurrentPage(1);
  }, []);
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
  const [pausedLogs, setPausedLogs] = useState<LogEntry[]>([]);
  const [tailBufferLimit, setTailBufferLimit] = useState<number>(() => {
    return parseInt(localStorage.getItem('tailBufferLimit') || '10000', 10);
  });

  useEffect(() => {
    localStorage.setItem('tailBufferLimit', String(tailBufferLimit));
  }, [tailBufferLimit]);


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
  const [annotations, setAnnotations] = useState<Record<string, string | AnnotationDetail>>(() => {
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

  // --- FASE 8: LOCAL DIRECTORY SETTINGS & AI CONFIG ---
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    localLogsDir: '',
    aiEnabled: false,
    aiProvider: 'gemini',
    aiEndpoint: '',
    aiModel: 'gemini-1.5-flash',
    hasAiApiKey: false
  });

  const saveLocalLogsDir = useCallback(async (dirPath: string) => {
    try {
      const updated = await saveSettings({ localLogsDir: dirPath });
      setSystemSettings(updated);
      // Re-fetch files to immediately update sidebar
      const freshFiles = await fetchFiles();
      setFiles(freshFiles);
    } catch (err: any) {
      throw new Error(err.message || 'Error al guardar directorio local');
    }
  }, [setFiles]);

  const updateSystemSettings = useCallback(async (newSettings: Partial<SystemSettings> & { aiApiKey?: string }) => {
    try {
      const updated = await saveSettings(newSettings);
      setSystemSettings(updated);
      if (newSettings.localLogsDir !== undefined) {
        const freshFiles = await fetchFiles();
        setFiles(freshFiles);
      }
    } catch (err: any) {
      throw new Error(err.message || 'Error al guardar la configuración');
    }
  }, [setFiles]);

  // --- FASE 5: WEBHOOK STATES & DISPATCHERS ---
  const [webhookUrl, setWebhookUrl] = useState<string>(() => {
    return localStorage.getItem('webhookUrl') || '';
  });
  const [webhookType, setWebhookType] = useState<'slack' | 'discord' | 'teams'>(() => {
    return (localStorage.getItem('webhookType') as 'slack' | 'discord' | 'teams') || 'slack';
  });
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(() => {
    return localStorage.getItem('webhookEnabled') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('webhookUrl', webhookUrl);
  }, [webhookUrl]);

  useEffect(() => {
    localStorage.setItem('webhookType', webhookType);
  }, [webhookType]);

  useEffect(() => {
    localStorage.setItem('webhookEnabled', String(webhookEnabled));
  }, [webhookEnabled]);

  const dispatchWebhookAlert = useCallback((entry: LogEntry) => {
    if (!webhookUrl) return;

    const dateStr = entry.timestamp || new Date().toISOString();
    const serviceStr = entry.service || 'N/A';
    const levelStr = entry.level || 'INFO';
    const cidStr = entry.correlationId || 'N/A';
    const messageSnippet = (entry.message || '').slice(0, 500) + ((entry.message || '').length > 500 ? '...' : '');

    let payload: any = {};
    if (webhookType === 'slack') {
      payload = {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *[LogScope Alert]* - Log Elevado / Crítico`
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Nivel:*\n${levelStr}` },
              { type: 'mrkdwn', text: `*Servicio:*\n${serviceStr}` },
              { type: 'mrkdwn', text: `*Correlación:*\n${cidStr}` },
              { type: 'mrkdwn', text: `*Fecha:*\n${dateStr}` }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Mensaje:*\n\`\`\`${messageSnippet}\`\`\` \n*Archivo Origen:* \`${entry.originFile || 'N/A'}\``
            }
          }
        ]
      };
    } else if (webhookType === 'discord') {
      payload = {
        embeds: [
          {
            title: `🚨 [LogScope Alert] - Log Elevado / Crítico`,
            color: levelStr === 'ERROR' ? 15158332 : (levelStr === 'WARN' ? 15105570 : 3447003),
            fields: [
              { name: 'Nivel', value: levelStr, inline: true },
              { name: 'Servicio', value: serviceStr, inline: true },
              { name: 'Correlación', value: cidStr, inline: true },
              { name: 'Fecha', value: dateStr, inline: true }
            ],
            description: `**Mensaje:**\n\`\`\`\n${messageSnippet}\n\`\`\`\n**Archivo Origen:** \`${entry.originFile || 'N/A'}\``
          }
        ]
      };
    } else if (webhookType === 'teams') {
      payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": levelStr === 'ERROR' ? "D63031" : (levelStr === 'WARN' ? "F1C40F" : "3498DB"),
        "summary": "LogScope Alert",
        "sections": [{
          "activityTitle": `🚨 [LogScope Alert] - Log Elevado / Crítico`,
          "facts": [
            { "name": "Nivel", "value": levelStr },
            { "name": "Servicio", "value": serviceStr },
            { "name": "Correlación", "value": cidStr },
            { "name": "Fecha", "value": dateStr },
            { "name": "Archivo Origen", "value": entry.originFile || 'N/A' }
          ],
          "text": `**Mensaje:**\n\`\`\`\n${messageSnippet}\n\`\`\``
        }]
      };
    }

    fetch('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, payload })
    }).then(res => res.json())
      .then(data => {
        console.log('[Webhook] Response:', data);
      })
      .catch(err => {
        console.error('[Webhook] Failed dispatching:', err);
      });
  }, [webhookUrl, webhookType]);

  const sendTestWebhook = useCallback(() => {
    const mockEntry: LogEntry = {
      id: 9999,
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'TestService',
      correlationId: 'test-cid-12345',
      message: 'Esta es una alerta de prueba generada automáticamente desde el panel de LogScope.',
      className: 'TestClass',
      thread: 'main',
      originFile: 'test-webhook-alert.log',
      raw: 'MOCK LOG LINE'
    };
    dispatchWebhookAlert(mockEntry);
  }, [dispatchWebhookAlert]);

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

  const [sshConnections, setSshConnections] = useState<SshConnectionConfig[]>([]);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshError, setSshError] = useState<string | null>(null);

  const loadSshConnections = useCallback(async () => {
    setSshLoading(true);
    setSshError(null);
    try {
      const res = await fetch('/api/ssh-connections');
      if (!res.ok) throw new Error('Failed to load connections');
      const data = await res.json();
      setSshConnections(data);
    } catch (err: any) {
      setSshError(err.message);
    } finally {
      setSshLoading(false);
    }
  }, []);

  const saveSshConnection = useCallback(async (config: SshConnectionConfig) => {
    setSshLoading(true);
    setSshError(null);
    try {
      const res = await fetch('/api/ssh-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error('Failed to save connection');
      await loadSshConnections();
      
      const filesRes = await fetchFiles();
      setFiles(filesRes);
    } catch (err: any) {
      setSshError(err.message);
      throw err;
    } finally {
      setSshLoading(false);
    }
  }, [loadSshConnections, setFiles]);

  const deleteSshConnection = useCallback(async (id: string) => {
    setSshLoading(true);
    setSshError(null);
    try {
      const res = await fetch(`/api/ssh-connections/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete connection');
      await loadSshConnections();
      
      const filesRes = await fetchFiles();
      setFiles(filesRes);
    } catch (err: any) {
      setSshError(err.message);
    } finally {
      setSshLoading(false);
    }
  }, [loadSshConnections, setFiles]);

  const testSshConnectionConfig = useCallback(async (config: SshConnectionConfig) => {
    try {
      const res = await fetch('/api/ssh-connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection test failed');
      return data.message || 'Connection successful!';
    } catch (err: any) {
      throw err;
    }
  }, []);

  useEffect(() => {
    loadSshConnections();
  }, [loadSshConnections]);

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
      const saved = localStorage.getItem(`pinnedKeys_${paneId}`);
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
      localStorage.setItem(`pinnedKeys_${paneId}`, JSON.stringify(Array.from(next)));
      return next;
    });
  }, [paneId]);

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

  // Live WebSocket Tailing Synchronizer - supports multiple selected files
  // (e.g. two `capa-media-avt-logger.log` from different SSH origins at once).
  const tailSubscriptions = selectedFiles.map(key => {
    const [origin, ...rest] = key.split('::');
    const filename = rest.join('::'); // handles names that contain "::"
    return { key, origin: origin || 'local', filename };
  });

  const isTailPausedRef = useRef(isTailPaused);
  useEffect(() => {
    isTailPausedRef.current = isTailPaused;
  }, [isTailPaused]);

  const tailBufferLimitRef = useRef(tailBufferLimit);
  useEffect(() => {
    tailBufferLimitRef.current = tailBufferLimit;
  }, [tailBufferLimit]);

  // The following refs allow the tail WebSocket callback to read the latest
  // values WITHOUT re-subscribing every time the user edits a rule, saves
  // an annotation, toggles desktop notifications, or changes the webhook
  // config. Re-subscribing tears down all live tails and reopens them,
  // which (a) drops in-flight lines from the server, (b) re-fires the
  // initial `tail -n 200` causing duplicate lines, and (c) wastes a
  // reconnect roundtrip on every keystroke in the annotation textarea.
  const rulesRef = useRef(rules);
  useEffect(() => { rulesRef.current = rules; }, [rules]);

  const annotationsRef = useRef(annotations);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  const desktopAlertsEnabledRef = useRef(desktopAlertsEnabled);
  useEffect(() => { desktopAlertsEnabledRef.current = desktopAlertsEnabled; }, [desktopAlertsEnabled]);

  const webhookEnabledRef = useRef(webhookEnabled);
  useEffect(() => { webhookEnabledRef.current = webhookEnabled; }, [webhookEnabled]);

  const dispatchWebhookAlertRef = useRef(dispatchWebhookAlert);
  useEffect(() => { dispatchWebhookAlertRef.current = dispatchWebhookAlert; }, [dispatchWebhookAlert]);

  // === Tail batching / flush ============================================
  // Acumular lineas crudas del WS en una cola y vaciarlas cada 50ms (o al
  // llegar a 100 lineas). Cada flush:
  //   1. parsea todas las lineas juntas (1 sola llamada a parseLogs en vez
  //      de N llamadas - el regex compila 1 vez, no N).
  //   2. actualiza setParsedLogs una sola vez (1 re-render en vez de N).
  //   3. re-indexa ids solo cuando hace falta (trim por buffer overflow o
  //      batches grandes), evitando O(n) por cada linea.
  // Sin batching, una rafaga de 200 logs/seg genera 200 re-renders/seg y
  // el navegador se ahoga.
  const TAIL_BATCH_INTERVAL_MS = 50;
  const TAIL_BATCH_MAX_LINES = 100;
  const TAIL_REINDEX_THRESHOLD = 50;

  // Cada item de la cola es { line, originFile } para soportar multiples
  // archivos tailed simultaneamente sin perder el origen.
  const tailBatchQueueRef = useRef<{ line: string; originFile: string }[]>([]);
  const tailBatchTimerRef = useRef<any>(null);
  const tailBatchRafRef = useRef<number | null>(null);
  const tailFlushingRef = useRef<boolean>(false);

  // Estado del WS mas reciente para el indicador LIVE.
  // tailStatusRef.current se actualiza en el callback onStatus (sin re-render).
  // tailStatusTick fuerza re-render del TailIndicator cuando cambia el estado.
  const tailStatusRef = useRef<any>({ state: 'closed' });
  const [tailStatusTick, setTailStatusTick] = useState(0);

  const flushTailBatch = useCallback(() => {
    // Si ya hay un flush en curso, dejar que termine (evita recursion).
    if (tailFlushingRef.current) return;
    tailFlushingRef.current = true;

    const queue = tailBatchQueueRef.current;
    tailBatchQueueRef.current = [];
    tailBatchTimerRef.current = null;
    tailBatchRafRef.current = null;

    if (queue.length === 0) {
      tailFlushingRef.current = false;
      return;
    }

    // Parsear cada linea del batch (que viene de su originFile respectivo).
    // Si una linea produce multiples entries (caso multilinea pegada), todas
    // heredan el mismo originFile (suficiente para filtros per-file).
    const allParsed: { entry: any; originFile: string }[] = [];
    for (const item of queue) {
      const parsed = parseLogs(item.line, parsers);
      for (const entry of parsed) {
        allParsed.push({ entry, originFile: item.originFile });
      }
    }

    if (allParsed.length === 0) {
      tailFlushingRef.current = false;
      return;
    }

    // Tag con originFile + originalId
    for (const { entry, originFile } of allParsed) {
      entry.originFile = originFile;
      entry.originalId = entry.id;
    }

    const entries = allParsed.map(p => p.entry);

    if (isTailPausedRef.current) {
      setPausedLogs(prev => {
        let next = [...prev, ...entries];
        if (next.length > tailBufferLimitRef.current) {
          next = next.slice(next.length - tailBufferLimitRef.current);
        }
        return next;
      });
    } else {
      setParsedLogs(prev => {
        // Calcular deltas por correlationId
        entries.forEach(entry => {
          const lastEntryWithSameCid = [...prev].reverse().find(e => e.correlationId === entry.correlationId && e.correlationId !== '-');
          if (lastEntryWithSameCid) {
            const prevTime = parseTimestamp(lastEntryWithSameCid.timestamp);
            const currTime = parseTimestamp(entry.timestamp);
            if (prevTime && currTime) {
              entry.deltaTimeMs = currTime.getTime() - prevTime.getTime();
            }
          }
        });

        let next = [...prev, ...entries];
        const trimmed = next.length > tailBufferLimitRef.current;
        if (trimmed) {
          next = next.slice(next.length - tailBufferLimitRef.current);
        }
        // Re-index SOLO cuando hubo trim O el batch fue grande.
        // Antes re-indexabamos SIEMPRE, que es O(n) por cada flush.
        if (trimmed || queue.length >= TAIL_REINDEX_THRESHOLD) {
          next.forEach((item, idx) => { item.id = idx + 1; });
        }
        return next;
      });
    }

    // Reglas, anotaciones, notificaciones y webhook -> microtask post-render.
    // Asi no bloqueamos el render principal ni notificamos antes de que el
    // usuario vea la linea en pantalla.
    queueMicrotask(() => {
      for (const entry of entries) {
        for (const rule of rulesRef.current) {
          if (rule.enabled && (entry.message || '').includes(rule.pattern)) {
            entry.level = rule.targetLevel;
            entry.customBadge = rule.customBadge;
            break;
          }
        }

        const noteKey = `${entry.originFile}::${entry.originalId}`;
        const savedAnn = annotationsRef.current[noteKey];
        if (savedAnn) {
          entry.annotation = typeof savedAnn === 'object' && savedAnn !== null
            ? (savedAnn as any).text
            : (savedAnn as string);
        }

        if (
          desktopAlertsEnabledRef.current &&
          document.visibilityState === 'hidden' &&
          (entry.level === 'ERROR' || entry.level === 'WARN' || entry.customBadge)
        ) {
          const title = `🚨 [${entry.level}] ${entry.service || 'Alerta LogScope'}`;
          const snippet = entry.message.slice(0, 120) + (entry.message.length > 120 ? '...' : '');
          try {
            const notification = new Notification(title, { body: snippet, icon: '/favicon.ico' });
            notification.onclick = () => { window.focus(); };
          } catch (e) {
            console.error('Error triggering notification:', e);
          }
        }

        if (
          webhookEnabledRef.current &&
          (entry.level === 'ERROR' || entry.level === 'WARN' || entry.customBadge)
        ) {
          dispatchWebhookAlertRef.current(entry);
        }
      }
    });

    tailFlushingRef.current = false;
  }, [parsers]);

  /**
   * Encola una linea cruda del WS con su originFile. Si el batch esta
   * lleno, fuerza flush; si no, agenda un flush en 50ms.
   */
  const enqueueTailLine = useCallback((line: string, originFile: string) => {
    tailBatchQueueRef.current.push({ line, originFile });

    if (tailBatchQueueRef.current.length >= TAIL_BATCH_MAX_LINES) {
      // Flush inmediato via rAF para no bloquear el event loop del WS
      if (tailBatchRafRef.current === null) {
        tailBatchRafRef.current = requestAnimationFrame(() => {
          tailBatchRafRef.current = null;
          if (tailBatchTimerRef.current) {
            clearTimeout(tailBatchTimerRef.current);
            tailBatchTimerRef.current = null;
          }
          flushTailBatch();
        });
      }
    } else if (tailBatchTimerRef.current === null) {
      tailBatchTimerRef.current = setTimeout(() => {
        tailBatchRafRef.current = requestAnimationFrame(() => {
          tailBatchRafRef.current = null;
          flushTailBatch();
        });
      }, TAIL_BATCH_INTERVAL_MS);
    }
  }, [flushTailBatch]);

  useEffect(() => {
    if (!isTailing) {
      // User toggled tail off -> drop every channel
      disconnectTail();
      return;
    }

    // Subscribe to every selected file. connectTail is idempotent for the
    // same (filename, origin) key, asi que esto es barato de re-ejecutar.
    for (const sub of tailSubscriptions) {
      connectTail(
        sub.filename,
        (line) => {
          // Cada WS onmessage solo encola. El flush se hace en batch via
          // rAF/setTimeout (ver flushTailBatch arriba). Eso elimina el lag
          // perceptible cuando entran rafagas de logs.
          enqueueTailLine(line, sub.key);
        },
        (err) => {
          console.error(`Tail WebSocket error callback for ${sub.key}:`, err);
        },
        sub.origin,
        (status) => {
          // Estado del WS hacia el indicador LIVE (boton + tooltip).
          // tailStatusRef se setea aca y se consulta en render via getTailStatus().
          tailStatusRef.current = status;
          // Forzar re-render del indicador. Usamos un counter para evitar
          // setState sobre el state grande.
          setTailStatusTick(t => t + 1);
        }
      );
    }

    // On unmount o cuando isTailing se apaga: cerrar todos los channels
    // y vaciar la cola pendiente.
    return () => {
      if (tailBatchTimerRef.current) {
        clearTimeout(tailBatchTimerRef.current);
        tailBatchTimerRef.current = null;
      }
      if (tailBatchRafRef.current !== null) {
        cancelAnimationFrame(tailBatchRafRef.current);
        tailBatchRafRef.current = null;
      }
      tailBatchQueueRef.current = [];
      disconnectTail();
    };
    // IMPORTANT: only re-subscribe when the subscription set itself changes.
    // rules/annotations/desktopAlertsEnabled/webhookEnabled/dispatchWebhookAlert
    // se leen dentro del callback via refs. Agregarlos aqui causaria un
    // reconnect storm en cada keystroke de anotacion o toggle de regla.
  }, [isTailing, selectedFiles.join('|'), parsers, enqueueTailLine]);

  // Effect to merge pausedLogs when resuming tailing
  useEffect(() => {
    if (!isTailPaused && pausedLogs.length > 0) {
      setParsedLogs(prev => {
        pausedLogs.forEach(entry => {
          const lastEntryWithSameCid = [...prev].reverse().find(e => e.correlationId === entry.correlationId && e.correlationId !== '-');
          if (lastEntryWithSameCid) {
            const prevTime = parseTimestamp(lastEntryWithSameCid.timestamp);
            const currTime = parseTimestamp(entry.timestamp);
            if (prevTime && currTime) {
              entry.deltaTimeMs = currTime.getTime() - prevTime.getTime();
            }
          }
        });

        let next = [...prev, ...pausedLogs];
        if (next.length > tailBufferLimit) {
          next = next.slice(next.length - tailBufferLimit);
        }
        // Re-index IDs consecutively
        next.forEach((item, idx) => {
          item.id = idx + 1;
        });
        return next;
      });
      setPausedLogs([]);
    }
  }, [isTailPaused, pausedLogs, tailBufferLimit]);



  // Load and merge logic using Web Worker and IndexedDB Cache
  const loadAndMergeFiles = useCallback(async (fileNames: string[], uploaded: Record<string, string>, currentRules: PromotionRule[], activeParsers: ParserConfig[]) => {
    if (fileNames.length === 0) {
      setParsedLogs([]);
      return;
    }
    
    try {
      const rulesHash = JSON.stringify(currentRules);
      const parsersHash = JSON.stringify(activeParsers);

      // Check if all requested files are cached
      let allLogsCached = true;
      const cachedParts: { name: string; logs: LogEntry[] }[] = [];
      const uncachedFileNames: string[] = [];

      for (const name of fileNames) {
        let size = 0;
        let mtime = '';
        
        if (uploaded[name]) {
          size = uploaded[name].length;
          mtime = 'uploaded';
        } else {
          const parts = name.split('::');
          const origin = parts.length > 1 ? parts[0] : 'local';
          const filename = parts.length > 1 ? parts[1] : name;
          const meta = files.find(f => f.name === filename && (f.origin || 'local') === origin);
          if (meta) {
            size = meta.sizeBytes;
            mtime = meta.modifiedAt;
          }
        }

        if (size > 0 && mtime) {
          const cached = await getLogsFromCache(name, size, mtime, rulesHash, parsersHash);
          if (cached) {
            // Defensive: ensure every cached entry has a stable originalId.
            // Older cache entries (or those from before the originalId field
            // existed) won't have it; fall back to the cached id which was the
            // parser-assigned identity at the time of caching. From now on
            // originalId is preserved across cache reads, so pins and
            // annotations keyed by `${originFile}::${originalId}` survive
            // reloads even when `id` is re-assigned during sort.
            const stamped = cached.map(entry => {
              if (entry.originalId === undefined || entry.originalId === null) {
                return { ...entry, originalId: entry.id };
              }
              return entry;
            });
            cachedParts.push({ name, logs: stamped });
          } else {
            allLogsCached = false;
            uncachedFileNames.push(name);
          }
        } else {
          allLogsCached = false;
          uncachedFileNames.push(name);
        }
      }

      let finalLogs: LogEntry[] = [];

      if (allLogsCached) {
        // If all files are cached, we merge them
        const combined: LogEntry[] = [];
        cachedParts.forEach(part => {
          combined.push(...part.logs);
        });
        finalLogs = combined;
      } else {
        // Fetch contents for uncached files only, parse them, cache them, and merge with cached ones
        const contents = await Promise.all(
          fileNames.map(async name => {
            if (uploaded[name]) {
              return { name, content: uploaded[name] };
            }
            const parts = name.split('::');
            const origin = parts.length > 1 ? parts[0] : 'local';
            const filename = parts.length > 1 ? parts[1] : name;

            const content = await fetchFileContent(filename, origin);
            return { name: filename, fileKey: name, content };
          })
        );

        // Parse all using the background Web Worker
        const withDeltas = await parseWithWorker(
          contents.map(c => ({ name: c.name, content: c.content })),
          currentRules,
          activeParsers
        );

        // Group parsed results by source file and save to cache
        for (const name of fileNames) {
          let size = 0;
          let mtime = '';
          
          if (uploaded[name]) {
            size = uploaded[name].length;
            mtime = 'uploaded';
          } else {
            const parts = name.split('::');
            const origin = parts.length > 1 ? parts[0] : 'local';
            const filename = parts.length > 1 ? parts[1] : name;
            const meta = files.find(f => f.name === filename && (f.origin || 'local') === origin);
            if (meta) {
              size = meta.sizeBytes;
              mtime = meta.modifiedAt;
            }
          }

          if (size > 0 && mtime) {
            const filenameForMatch = name.includes('::') ? name.split('::')[1] : name;
            const fileLogs = withDeltas.filter(l => l.originFile === filenameForMatch);
            await saveLogsToCache(name, size, mtime, rulesHash, parsersHash, fileLogs);
          }
        }

        finalLogs = withDeltas;
      }

      // Re-index all log items chronologically if we have multiple files
      if (fileNames.length > 1) {
        // Sort chronologically using parseTimestamp helper
        finalLogs.sort((a, b) => {
          const tA = parseTimestamp(a.timestamp);
          const tB = parseTimestamp(b.timestamp);
          if (tA && tB) return tA.getTime() - tB.getTime();
          if (tA && !tB) return -1;
          if (!tA && tB) return 1;
          return 0;
        });

        // Recalculate deltas and ids.
        // NOTE: we only re-assign the *display* `id`. The `originalId` field
        // (set by the parser or stamped from cache) is the STABLE identity
        // used by pins/annotations and must never be overwritten here.
        finalLogs.forEach((item, idx) => {
          item.id = idx + 1;
        });

        // Recalculate deltas per correlationId chronologically
        const lastTimes = new Map<string, Date>();
        finalLogs.forEach(item => {
          if (item.correlationId && item.correlationId !== '-') {
            const currentT = parseTimestamp(item.timestamp);
            if (currentT) {
              const lastT = lastTimes.get(item.correlationId);
              if (lastT) {
                item.deltaTimeMs = currentT.getTime() - lastT.getTime();
              } else {
                delete item.deltaTimeMs;
              }
              lastTimes.set(item.correlationId, currentT);
            }
          }
        });
      }

      // Inject any existing comments / annotations on the main thread
      let savedAnnotations: Record<string, any> = {};
      try {
        const saved = localStorage.getItem('logAnnotations');
        if (saved) savedAnnotations = JSON.parse(saved);
      } catch {}

      finalLogs.forEach(entry => {
        const entryKey = `${entry.originFile || 'upload'}::${entry.originalId || entry.id}`;
        const savedAnn = savedAnnotations[entryKey];
        if (savedAnn) {
          entry.annotation = typeof savedAnn === 'object' && savedAnn !== null ? (savedAnn as any).text : (savedAnn as string);
        }
      });

      setParsedLogs(finalLogs);

      // Auto-activate all parsed levels (base + dynamic)
      const parsedUnique = finalLogs.map(l => l.level).filter(Boolean);
      const base = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'REQ', 'RESP'];
      const nextLevels = new Set([...base, ...parsedUnique]);
      setFilters(prev => ({ ...prev, activeLevels: nextLevels }));
    } catch (error) {
      console.error("Error loading and merging files using worker/cache:", error);
    }
  }, [parseWithWorker, files]);

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
    
    // Load general system settings
    fetchSettings().then(s => {
      setSystemSettings(s);
    }).catch(err => {
      console.error("Error loading system settings:", err);
    });

    fetchFiles().then(async (f) => {
      setFiles(f);
      setLoadingFiles(false);
      
      let initialSelected: string[] = [];
      try {
        const saved = localStorage.getItem(`selectedFiles_${paneId}`);
        if (saved) {
          initialSelected = JSON.parse(saved);
        }
      } catch (e) {
        console.error("Error loading selectedFiles from localStorage", e);
      }

      if (initialSelected.length === 0) {
        const lastActiveName = localStorage.getItem(`activeFileName_${paneId}`);
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
        localStorage.setItem(`selectedFiles_${paneId}`, JSON.stringify(initialSelected));
      }
    });
  }, [paneId]);

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
      localStorage.setItem(`selectedFiles_${paneId}`, JSON.stringify(next));
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
  }, [paneId]);

  const handleFileSelectOnly = useCallback((fileName: string) => {
    setSelectedFiles([fileName]);
    localStorage.setItem(`selectedFiles_${paneId}`, JSON.stringify([fileName]));
    localStorage.setItem(`activeFileName_${paneId}`, fileName);
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
  }, [paneId]);

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
        localStorage.setItem(`selectedFiles_${paneId}`, JSON.stringify(next));
        return next;
      });
      
      localStorage.setItem(`activeFileName_${paneId}`, file.name);
      resetFilters();
      setActiveLog(null);
      setIsDrawerOpen(false);
    };
    reader.readAsText(file);
  }, [paneId]);

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
        quickFilter: filters.quickFilter,
        endpointFilter: filters.endpointFilter || null,
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
      quickFilter: preset.filters.quickFilter,
      endpointFilter: (preset.filters as any).endpointFilter ?? null,
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
        next[noteKey] = {
          text,
          timestamp: log.timestamp,
          service: log.service,
          level: log.level,
          correlationId: log.correlationId,
          message: log.message,
          originFile: log.originFile || 'upload',
          logId: log.id
        };
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

    // Update activeLog if it's the one being annotated
    setActiveLog(prev => {
      if (prev) {
        const prevKey = `${prev.originFile || 'upload'}::${prev.originalId || prev.id}`;
        if (prevKey === noteKey) {
          return { ...prev, annotation: text || undefined };
        }
      }
      return prev;
    });
  }, [setActiveLog]);


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
            const savedAnn = jsonData.annotations[entryKey];
            if (savedAnn) {
              const text = typeof savedAnn === 'object' && savedAnn !== null ? (savedAnn as any).text : (savedAnn as string);
              return { ...entry, annotation: text };
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
    resetFilters,
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
    pausedLogs,
    tailBufferLimit,
    setTailBufferLimit,
    tailStatus: tailStatusRef.current,
    tailStatusTick,
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
    downloadFilteredLogs,
    // Fase 5 Upgrades
    webhookUrl,
    setWebhookUrl,
    webhookType,
    setWebhookType,
    webhookEnabled,
    setWebhookEnabled,
    sendTestWebhook,
    // SSH connection manager variables and actions
    sshConnections,
    sshLoading,
    sshError,
    loadSshConnections,
    saveSshConnection,
    deleteSshConnection,
    testSshConnectionConfig,
    // Fase 8 Dynamic Local logs directory settings
    localLogsDir: systemSettings.localLogsDir,
    saveLocalLogsDir,
    systemSettings,
    updateSystemSettings
  };
}
export type LogViewerState = ReturnType<typeof useLogViewerState>;

