import * as fs from 'fs';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';

const TAG_REGEX_GLOBAL = /#([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}0-9a-zA-Z\-\/_]+)/gu;

export function createFileMeta(filePath: string): FileMeta {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  let title = path.basename(filePath);
  let tags: string[] = [];

  // タイトル取得
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0){
      continue;
    }

    if (trimmed.startsWith('# ')) {
      title = trimmed.substring(2).trim();
    }
    break;
  }

  // タグ抽出（行全体がハッシュタグのみ）
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')){
      continue;
    }
    if (trimmed.startsWith('# ')){
      continue; // 見出し除外
    }

    // 1行に複数タグがある場合も抽出
    const matches = [...trimmed.matchAll(TAG_REGEX_GLOBAL)];
    if (matches.length > 0) {
      tags.push(...matches.map(m => m[1]));
    }
  }

  return {
    filePath,
    title,
    tags
  };
}
