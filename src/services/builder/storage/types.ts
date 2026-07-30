/**
 * Vercel-safe runtime storage for AI Company.
 * Sync API preserves existing store call sites; optional KV is write-through.
 */

export type RuntimeStorageBackend = {
  readonly name: string;
  getText(key: string): string | null;
  setText(key: string, value: string): void;
  appendText(key: string, value: string): void;
  delete(key: string): void;
  listKeys(prefix: string): string[];
  /** True when the backend can accept writes (memory always; KV when configured). */
  isWritable(): boolean;
};

export type RuntimeStorageStatus = {
  backend: string;
  writable: boolean;
  persistent: boolean;
  fallback: boolean;
  detail: string;
};
