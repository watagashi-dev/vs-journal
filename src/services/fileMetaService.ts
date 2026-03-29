import * as fs from 'fs';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';
import { extractTags } from './tagLogic';

export function createFileMeta(
    filePath: string,
    readFile?: () => string
): FileMeta {
    let ctime = 0, mtime = 0, size = 0;
    if (!readFile) {
        const stats = fs.statSync(filePath);
        ctime = stats.ctimeMs;
        mtime = stats.mtimeMs;
        size = stats.size;
    }
    // --- 1. ファイル統計を一度取得 ---
    const fileName = path.basename(filePath);

    // --- 2. ファイル内容を取得 ---
    const content = readFile ? readFile() : fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    // --- 3. タイトル取得（先頭の # ） ---
    let title = fileName;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) { continue; }
        if (trimmed.startsWith('# ')) {
            title = trimmed.substring(2).trim();
        }
        break; // 先頭の見出しだけ見れば十分
    }

    // --- 4. タグ抽出（コードブロック内を除外） ---
    const tags: string[] = [];
    let inCodeBlock = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) { continue; }

        const extracted = extractTags(trimmed); // 既存の多行対応関数
        if (extracted.length > 0) {
            tags.push(...extracted);
        }
    }

    // --- 5. FileMeta を返す ---
    return {
        filePath,
        fileName,
        title,
        tags,
        ctime,
        mtime,
        size
    };
}
