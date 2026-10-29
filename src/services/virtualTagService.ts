import {
    FileMeta,
    VirtualTagFile,
} from '../models/FileMeta';
import {
    virtualTagSet,
    virtualTagIndexMap
} from '../state';
import { filePathToKey } from '../extension';

function addMetaToTagIndex(
    tag: string,
    meta: FileMeta,
    matchedLines: number[]
): void {
    let fileMap = virtualTagIndexMap.get(tag);

    if (!fileMap) {
        fileMap = new Map<string, VirtualTagFile>();
        virtualTagIndexMap.set(tag, fileMap);
    }

    const key = filePathToKey(meta.filePath);
    fileMap.set(key, {
        meta,
        matchedLines
    });
}

function findVirtualTagMatchesInLines(
    tag: string,
    lines: string[],
    caseSensitive: boolean
): number[] {
    const matches: number[] = [];

    const target = caseSensitive
        ? tag
        : tag.toLowerCase();

    if (target.length === 0) {
        return matches;
    }

    for (let line = 0; line < lines.length; line++) {
        const lineText = caseSensitive
            ? lines[line]
            : lines[line].toLowerCase();

        let searchStart = 0;

        while (true) {
            const index = lineText.indexOf(target, searchStart);

            if (index === -1) {
                break;
            }

            matches.push(line);
            searchStart = index + target.length;
        }
    }

    return matches;
}

function containsVirtualTag(
    tag: string,
    content: string,
    caseSensitive: boolean
): boolean {
    if (tag.length === 0) {
        return false;
    }

    const target = caseSensitive
        ? tag
        : tag.toLowerCase();

    const source = caseSensitive
        ? content
        : content.toLowerCase();

    return source.includes(target);
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

    const lines = content.split(/\r?\n/);

    for (const tag of virtualTagSet) {
        const matchedLines = findVirtualTagMatchesInLines(
            tag,
            lines,
            caseSensitive
        );

        if (matchedLines.length === 0) {
            continue;
        }

        addMetaToTagIndex(
            tag,
            meta,
            matchedLines
        );
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

    if (typeof content === 'string') {
        return containsVirtualTag(
            keyword,
            content,
            caseSensitive
        );
    }

    return content.some(c =>
        containsVirtualTag(
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

    const target = caseSensitive
        ? keyword
        : keyword.toLowerCase();

    if (target.length === 0) {
        return [
            {
                text: content,
                virtualTag: false
            }
        ];
    }

    const segments: TagSegment[] = [];
    let position = 0;

    while (position < content.length) {
        const remaining = content.slice(position);
        const source = caseSensitive
            ? remaining
            : remaining.toLowerCase();

        const index = source.indexOf(target);

        if (index === -1) {
            break;
        }

        // Find the matching position in the original content.
        let originalIndex = position;
        let lowerLength = 0;

        while (originalIndex < content.length && lowerLength < index) {
            const char = content[originalIndex];
            const lowerChar = caseSensitive
                ? char
                : char.toLowerCase();

            lowerLength += lowerChar.length;
            originalIndex += char.length;
        }

        if (originalIndex > position) {
            segments.push({
                text: content.slice(position, originalIndex),
                virtualTag: false
            });
        }

        // Find the end of the match in the original content.
        let originalEnd = originalIndex;
        let matchedLength = 0;

        while (originalEnd < content.length && matchedLength < target.length) {
            const char = content[originalEnd];
            const lowerChar = caseSensitive
                ? char
                : char.toLowerCase();

            matchedLength += lowerChar.length;
            originalEnd += char.length;
        }

        segments.push({
            text: content.slice(originalIndex, originalEnd),
            virtualTag: true
        });

        position = originalEnd;
    }

    if (position < content.length) {
        segments.push({
            text: content.slice(position),
            virtualTag: false
        });
    }

    if (segments.length === 0) {
        return [
            {
                text: content,
                virtualTag: false
            }
        ];
    }

    return segments;
}