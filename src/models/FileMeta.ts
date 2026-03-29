export interface FileMeta {
  filePath: string;
  fileName: string;
  title: string;
  tags: string[];
  ctime: number;       // 作成時刻 (ms)
  mtime: number;       // 更新時刻 (ms)
  size: number;        // ファイルサイズ (bytes)
}
