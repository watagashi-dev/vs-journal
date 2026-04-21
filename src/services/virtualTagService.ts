import { FileMeta } from '../models/FileMeta';
import { readFileEntry } from '../extension';
import {
    virtualTagSet,
    virtualTagIndexMap
} from '../state';

/**
 * Index virtual tags using tag-driven includes matching.
 */
export function indexVirtualTags(
    meta: FileMeta,
    content: string
): void {

    if (virtualTagSet.size === 0) {
        return;
    }

    const lines = content.split(/\r?\n/);

    for (const tag of virtualTagSet) {

        const hitLines: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes(tag)) {
                hitLines.push(i);
            }
        }

        if (hitLines.length === 0) {
            continue;
        }

        // --- index map ---
        const files = virtualTagIndexMap.get(tag) ?? [];

        const exists = files.some(f => f.filePath === meta.filePath);
        if (!exists) {
            virtualTagIndexMap.set(tag, [...files, meta]);
        }
    }
}

/**
 * Clear virtual tag state (for testing).
 */
export function clearVirtualTagState(): void {
    virtualTagSet.clear();
    virtualTagIndexMap.clear();
}

export function removeVirtualTagsForFile(filePath: string): void {
    for (const [tag, files] of virtualTagIndexMap.entries()) {
        const updated = files.filter(f => f.filePath !== filePath);

        if (updated.length === 0) {
            virtualTagIndexMap.delete(tag);
        } else {
            virtualTagIndexMap.set(tag, updated);
        }
    }
}

/**
 * Rebuild virtual tag index from all files.
 */
export function rebuildVirtualTagIndex(
    fileMetaMap: Map<string, FileMeta>,
    readFile: (filePath: string) => string
): void {

    virtualTagIndexMap.clear();

    if (virtualTagSet.size === 0) {
        return;
    }

    for (const meta of fileMetaMap.values()) {
        const content = readFile(meta.filePath);
        indexVirtualTags(meta, content);
    }
}

/**
 * Index a newly added virtual tag against all existing files.
 * This is incremental update (not full rebuild).
 */
export function indexVirtualTagForAllFiles(
    tag: string,
    fileMetaMap: Map<string, FileMeta>
): void {

    for (const meta of fileMetaMap.values()) {
        const { content } = readFileEntry(meta.filePath);

        if (!content.includes(tag)) {
            continue;
        }

        const list = virtualTagIndexMap.get(tag) ?? [];

        if (!list.some(m => m.filePath === meta.filePath)) {
            list.push(meta);
            virtualTagIndexMap.set(tag, list);
        }
    }
}
