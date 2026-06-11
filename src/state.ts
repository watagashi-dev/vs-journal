import { FileMeta } from './models/FileMeta';
import { filePathToKey } from './extension';

const cursorLineMap = new Map<string, number>();
let lastActiveFilePath: string | undefined;

export const systemTagIndexMap = new Map<string, FileMeta[]>();
export const userTagIndexMap = new Map<string, FileMeta[]>();
export const virtualTagIndexMap = new Map<string, Map<string, FileMeta>>();

export const virtualTagSet = new Set<string>();

export function setCursorLine(filePath: string, line: number) {
    // Store the latest cursor line for the given file
    lastActiveFilePath = filePath;
    const fileKey = filePathToKey(filePath);
    cursorLineMap.set(fileKey, line);
}

export function getCursorLine(filePath: string): number | undefined {
    const fileKey = filePathToKey(filePath);
    const line = cursorLineMap.get(fileKey);

    // If the file no longer exists, remove stale entry
    if (line !== undefined) {
        try {
            require('fs').accessSync(filePath);
        } catch {
            cursorLineMap.delete(fileKey);
            return undefined;
        }
    }

    return line;
}

export function getLastActiveFilePath(): string | undefined {
    return lastActiveFilePath;
}

export function clearCursorLine(filePath: string) {
    // Explicitly remove cursor tracking for a file
    cursorLineMap.delete(filePath);
}

export function resetVirtualTags(): void {
    virtualTagSet.clear();
    virtualTagIndexMap.clear();
}
