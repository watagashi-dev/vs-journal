import * as fs from 'fs';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';
import { CodeBlockTracker, extractTags } from './tagLogic';

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
    // --- 1. Get file metadata ---
    const fileName = path.basename(filePath);

    // --- 2. Read file content ---
    const content = readFile ? readFile() : fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    // --- 3. Extract title (from the first # heading) ---
    let title = fileName;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) { continue; }
        if (trimmed.startsWith('# ')) {
            title = trimmed.substring(2).trim();
        }
        break; // Only check the first non-empty line
    }

    // --- 4. Extract tags (excluding code blocks) ---
    const tags: string[] = [];
    const tracker = new CodeBlockTracker();

    for (const line of lines) {
        if (!tracker.processLine(line)) { continue; }

        const extracted = extractTags(line.trim()); // Reuse multi-line aware extraction logic
        if (extracted.length > 0) {
            tags.push(...extracted);
        }
    }

    // --- 5. Return FileMeta object ---
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
