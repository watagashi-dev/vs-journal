export interface HeadingMeta {
  text: string;
  level: number;
  line: number;
  tags: string[];
}

export interface FileMeta {
  filePath: string;
  fileName: string;
  title: string;
  tags: string[];
  headings: HeadingMeta[];
  ctime: number;       // Creation time (ms)
  mtime: number;       // Modification time (ms)
  size: number;        // File size (bytes)
}
