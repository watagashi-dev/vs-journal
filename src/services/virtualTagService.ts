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
    content: string,
    caseSensitive: boolean
): void {

    if (virtualTagSet.size === 0) {
        return;
    }

    const targetContent = caseSensitive ? content : content.toLowerCase();

    for (const tag of virtualTagSet) {

        const targetTag = caseSensitive ? tag : tag.toLowerCase();

        if (!targetContent.includes(targetTag)) {
            continue;
        }

        const files = virtualTagIndexMap.get(tag) ?? [];

        if (!files.some(f => f.filePath === meta.filePath)) {
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
    readFile: (filePath: string) => string,
    caseSensitive: boolean
): void {

    virtualTagIndexMap.clear();

    if (virtualTagSet.size === 0) {
        return;
    }

    for (const meta of fileMetaMap.values()) {
        const content = readFile(meta.filePath);
        indexVirtualTags(meta, content, caseSensitive);
    }
}

/**
 * Index a newly added virtual tag against all existing files.
 * This is incremental update (not full rebuild).
 */
export function indexVirtualTagForAllFiles(
    tag: string,
    fileMetaMap: Map<string, FileMeta>,
    caseSensitive: boolean
): void {

    const normalizedTag = caseSensitive ? tag : tag.toLowerCase();

    for (const meta of fileMetaMap.values()) {
        const { content } = readFileEntry(meta.filePath);

        const normalizedContent = caseSensitive
            ? content
            : content.toLowerCase();

        if (!normalizedContent.includes(normalizedTag)) {
            continue;
        }

        const list = virtualTagIndexMap.get(tag) ?? [];

        if (!list.some(m => m.filePath === meta.filePath)) {
            list.push(meta);
            virtualTagIndexMap.set(tag, list);
        }
    }
}

export function reindexSingleVirtualTag(
    tag: string,
    fileMetaMap: Map<string, FileMeta>,
    caseSensitive: boolean
): void {

    virtualTagIndexMap.delete(tag);

    const normalizedTag = caseSensitive ? tag : tag.toLowerCase();

    for (const meta of fileMetaMap.values()) {

        const { content } = readFileEntry(meta.filePath);

        const normalizedContent = caseSensitive
            ? content
            : content.toLowerCase();

        if (!normalizedContent.includes(normalizedTag)) {
            continue;
        }

        const list = virtualTagIndexMap.get(tag) ?? [];

        if (!list.some(m => m.filePath === meta.filePath)) {
            list.push(meta);
            virtualTagIndexMap.set(tag, list);
        }
    }
}
