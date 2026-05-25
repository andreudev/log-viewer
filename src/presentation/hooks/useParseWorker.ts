import { useState, useEffect, useRef, useCallback } from 'react';
import { LogEntry } from '../../domain/models/LogEntry';
import { ParserConfig } from '../../domain/models/ParserConfig';
import { PromotionRule } from '../../domain/models/PromotionRule';

interface UseParseWorkerResult {
  isProcessing: boolean;
  progress: number;
  statusText: string;
  error: string | null;
  parseWithWorker: (
    files: { name: string; content: string }[],
    rules: PromotionRule[],
    parsers: ParserConfig[]
  ) => Promise<LogEntry[]>;
  terminateWorker: () => void;
}

export function useParseWorker(): UseParseWorkerResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((value: LogEntry[]) => void) | null>(null);
  const rejectRef = useRef<((reason: any) => void) | null>(null);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsProcessing(false);
    setProgress(0);
    setStatusText('');
  }, []);

  const parseWithWorker = useCallback(
    (
      files: { name: string; content: string }[],
      rules: PromotionRule[],
      parsers: ParserConfig[]
    ): Promise<LogEntry[]> => {
      terminateWorker(); // Reiniciar si ya había uno corriendo
      setIsProcessing(true);
      setProgress(0);
      setStatusText('Iniciando Web Worker...');
      setError(null);

      return new Promise<LogEntry[]>((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;

        try {
          // Instanciación nativa moderna compatible con Vite
          const worker = new Worker(
            new URL('../../domain/workers/parseWorker.ts', import.meta.url),
            { type: 'module' }
          );
          workerRef.current = worker;

          worker.onmessage = (event: MessageEvent) => {
            const data = event.data;
            if (data.type === 'progress') {
              setProgress(data.progress);
              if (data.statusText) {
                setStatusText(data.statusText);
              }
            } else if (data.type === 'success') {
              setIsProcessing(false);
              setProgress(100);
              setStatusText('Completado');
              if (resolveRef.current) {
                resolveRef.current(data.logs);
              }
              terminateWorker();
            } else if (data.type === 'error') {
              setIsProcessing(false);
              setError(data.error);
              if (rejectRef.current) {
                rejectRef.current(new Error(data.error));
              }
              terminateWorker();
            }
          };

          worker.onerror = (err) => {
            setIsProcessing(false);
            setError('Error de ejecución en el hilo de procesamiento.');
            if (rejectRef.current) {
              rejectRef.current(err);
            }
            terminateWorker();
          };

          worker.postMessage({ files, rules, parsers });
        } catch (err: any) {
          setIsProcessing(false);
          setError(err.message || 'No se pudo inicializar el Web Worker.');
          reject(err);
        }
      });
    },
    [terminateWorker]
  );

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  return {
    isProcessing,
    progress,
    statusText,
    error,
    parseWithWorker,
    terminateWorker
  };
}
