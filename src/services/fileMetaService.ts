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

    // Extract tags safely with code block awareness
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock; // toggle code block state
            continue;
        }

        if (inCodeBlock) { continue; } // skip lines inside code blocks

        const extracted = extractTags(line); // use existing multi-line aware function
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
