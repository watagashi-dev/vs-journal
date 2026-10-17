export interface HeadingMeta {
  text: string;
  rawText: string;
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

export interface VirtualTagMatch {
  line: number;
  start: number;
  end: number;
  isHeading: boolean;
}

export interface VirtualTagFile {
  meta: FileMeta;
  matches: VirtualTagMatch[];
}

export type VirtualTagSession = {
  keyword: string;
  caseSensitive: boolean;
  matches: VirtualTagFile[];
};