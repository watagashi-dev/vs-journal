import * as fs from 'fs';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';
import { extractTags } from './tagLogic';

export function createFileMeta(
    filePath: string,
    readFile?: () => string
): FileMeta {
    const content = readFile
        ? readFile()
        : fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    let title = path.basename(filePath);
    let tags: string[] = [];

    // Get title
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }

        if (trimmed.startsWith('# ')) {
            title = trimmed.substring(2).trim();
        }
        break;
    }

    // Extract tags (entire line contains hashtags only)
    for (const line of lines) {
        const extracted = extractTags(line);
        if (extracted.length > 0) {
            tags.push(...extracted);
        }   
    }

    return {
        filePath,
        title,
        tags
    };
}
