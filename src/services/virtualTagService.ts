import { FileMeta } from '../models/FileMeta';
import {
    virtualTagSet,
    virtualTagIndexMap
} from '../state';

function matchVirtualTag(
    tag: string,
    content: string,
    caseSensitive: boolean
): boolean {
    const c = caseSensitive ? content : content.toLowerCase();
    const t = caseSensitive ? tag : tag.toLowerCase();
    return c.includes(t);
}

function addMetaToTagIndex(tag: string, meta: FileMeta): void {
    const files = virtualTagIndexMap.get(tag) ?? [];

    if (!files.some(f => f.filePath === meta.filePath)) {
        virtualTagIndexMap.set(tag, [...files, meta]);
    }
}

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

    for (const tag of virtualTagSet) {
        if (!matchVirtualTag(tag, content, caseSensitive)) {
            continue;
        }

        addMetaToTagIndex(tag, meta);
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
