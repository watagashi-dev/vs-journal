import { FileMeta } from '../models/FileMeta';
import {
    virtualTagSet,
    virtualTagIndexMap
} from '../state';
import { filePathToKey } from '../extension';

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
    let fileMap = virtualTagIndexMap.get(tag);

    if (!fileMap) {
        fileMap = new Map<string, FileMeta>();
        virtualTagIndexMap.set(tag, fileMap);
    }

    const key = filePathToKey(meta.filePath);
    fileMap.set(key, meta);
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
    for (const [tag, fileMap] of virtualTagIndexMap.entries()) {
        const key = filePathToKey(filePath);
        fileMap.delete(key);

        if (fileMap.size === 0) {
            virtualTagIndexMap.delete(tag);
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

export function matchesPreviewVirtualTag(
    content: string | string[],
    keyword: string | undefined,
    caseSensitive: boolean
): boolean {

    if (!keyword) {
        return false;
    }

    const contents =
        Array.isArray(content)
            ? content
            : [content];

    return contents.some(c =>
        matchVirtualTag(
            keyword,
            c,
            caseSensitive
        )
    );
}

export interface TagSegment {
    text: string;
    virtualTag: boolean;
}

export function buildTagSegments(
    content: string,
    keyword: string | undefined,
    caseSensitive: boolean
): TagSegment[] {

    if (!keyword) {
        return [
            {
                text: content,
                virtualTag: false
            }
        ];
    }

    const source = caseSensitive
        ? content
        : content.toLowerCase();

    const target = caseSensitive
        ? keyword
        : keyword.toLowerCase();

    const index = source.indexOf(target);

    if (index === -1) {
        return [
            {
                text: content,
                virtualTag: false
            }
        ];
    }

    const segments: TagSegment[] = [];

    if (index > 0) {
        segments.push({
            text: content.slice(0, index),
            virtualTag: false
        });
    }

    segments.push({
        text: content.slice(
            index,
            index + keyword.length
        ),
        virtualTag: true
    });

    const remain =
        content.slice(index + keyword.length);

    if (remain.length > 0) {
        segments.push({
            text: remain,
            virtualTag: false
        });
    }

    return segments;
}