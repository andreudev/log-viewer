export interface LogFileMeta {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  createdAt: string;
}

export async function fetchFiles(): Promise<LogFileMeta[]> {
  const response = await fetch('/api/files');
  if (!response.ok) {
    throw new Error('Failed to load files');
  }
  return response.json();
}

export async function fetchFileContent(filename: string): Promise<string> {
  const response = await fetch(`/api/files/${encodeURIComponent(filename)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch file content');
  }
  return response.text();
}
