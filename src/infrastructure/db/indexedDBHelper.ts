import { LogEntry } from '../../domain/models/LogEntry';

const DB_NAME = 'LogScopeDBCache';
const DB_VERSION = 1;
const STORE_NAME = 'logs_cache';

export interface CacheEntry {
  fileKey: string;
  sizeBytes: number;
  modifiedAt: string;
  rulesHash: string;
  parsersHash: string;
  logs: LogEntry[];
  cachedAt: number;
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fileKey' });
      }
    };
  });
}

export async function getLogsFromCache(
  fileKey: string,
  sizeBytes: number,
  modifiedAt: string,
  rulesHash: string,
  parsersHash: string
): Promise<LogEntry[] | null> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(fileKey);

      request.onsuccess = () => {
        const entry: CacheEntry = request.result;
        if (
          entry &&
          entry.sizeBytes === sizeBytes &&
          entry.modifiedAt === modifiedAt &&
          entry.rulesHash === rulesHash &&
          entry.parsersHash === parsersHash
        ) {
          resolve(entry.logs);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (e) {
    console.error('IndexedDB get error:', e);
    return null;
  }
}

export async function saveLogsToCache(
  fileKey: string,
  sizeBytes: number,
  modifiedAt: string,
  rulesHash: string,
  parsersHash: string,
  logs: LogEntry[]
): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const entry: CacheEntry = {
        fileKey,
        sizeBytes,
        modifiedAt,
        rulesHash,
        parsersHash,
        logs,
        cachedAt: Date.now()
      };
      
      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('IndexedDB save error:', e);
  }
}
