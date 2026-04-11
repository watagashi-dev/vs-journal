export interface FileMeta {
  filePath: string;
  fileName: string;
  title: string;
  tags: string[];
  ctime: number;       // Creation time (ms)
  mtime: number;       // Modification time (ms)
  size: number;        // File size (bytes)
}
