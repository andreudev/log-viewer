export interface LogFileMeta {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  createdAt: string;
  origin?: string;
  originName?: string;
}

export async function fetchFiles(): Promise<LogFileMeta[]> {
  const response = await fetch('/api/files');
  if (!response.ok) {
    throw new Error('Failed to load files');
  }
  return response.json();
}

export async function fetchFileContent(filename: string, origin = 'local'): Promise<string> {
  const response = await fetch(`/api/files/${encodeURIComponent(filename)}?origin=${encodeURIComponent(origin)}`);
  if (!response.ok) {
    // Error estructurado: el caller puede distinguir 404 (archivo borrado)
    // de otros errores (server caido, permisos, etc).
    const err: FetchFileError = new Error(
      response.status === 404
        ? `Archivo no encontrado: ${filename}`
        : `Error ${response.status} al leer ${filename}`
    ) as FetchFileError;
    err.status = response.status;
    err.filename = filename;
    err.origin = origin;
    err.isNotFound = response.status === 404;
    throw err;
  }
  return response.text();
}

export interface FetchFileError extends Error {
  status?: number;
  filename?: string;
  origin?: string;
  isNotFound?: boolean;
}

export interface SystemSettings {
  localLogsDir: string;
  aiEnabled: boolean;
  aiProvider: 'gemini' | 'openai-compatible' | 'ollama';
  aiEndpoint?: string;
  aiModel?: string;
  hasAiApiKey?: boolean;
}

export async function fetchSettings(): Promise<SystemSettings> {
  const response = await fetch('/api/settings');
  if (!response.ok) {
    throw new Error('Failed to load system settings');
  }
  return response.json();
}

export async function saveSettings(settings: Partial<SystemSettings> & { aiApiKey?: string }): Promise<SystemSettings> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save system settings');
  }
  const data = await response.json();
  return data.settings;
}

export interface ReplayRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface ReplayResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
}

export async function executeReplay(request: ReplayRequest): Promise<ReplayResponse> {
  const response = await fetch('/api/replay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to execute replay request');
  }
  return response.json();
}

export interface GlobalSearchResult {
  fileKey: string;
  fileName: string;
  originName: string;
  count: number;
  snippets: Array<{ lineNum: number; text: string }>;
}

export async function executeGlobalSearch(query: string, isRegex: boolean): Promise<GlobalSearchResult[]> {
  const response = await fetch('/api/search-global', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, isRegex })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to execute global search');
  }
  const data = await response.json();
  return data.results || [];
}

export interface FixPermResult {
  ok: boolean;
  mode: 'plain' | 'sudo';
  stderr?: string;
  remoteFilePath?: string;
  host?: string;
}

export async function fixRemoteFilePermissions(filename: string, origin: string): Promise<FixPermResult> {
  const response = await fetch('/api/ssh-fix-perm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, origin })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data.ok) {
    throw new Error(data.error || data.stderr || 'fix-perm failed');
  }
  return data;
}

