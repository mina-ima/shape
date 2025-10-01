/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface Window {
  showSaveFilePicker?(options?: {
    suggestedName?: string;
  }): Promise<FileSystemFileHandle>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}