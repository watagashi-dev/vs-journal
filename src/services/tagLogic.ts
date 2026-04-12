// ============================
// Tag Logic Utilities
// ============================
import { FileMeta } from '../models/FileMeta';

// Regex for tag token (unchanged to preserve current behavior)
const TAG_REGEX = /#([\p{L}\p{N}_\-/ー]+)$/u;

// Checks if a string is a valid tag token
export function isTagToken(token: string): boolean {
    return TAG_REGEX.test(token);
}

// Identifies the type of the given line
export function getLineType(line: string): 'tag' | 'heading' | 'other' | 'partial' {
    const trimmed = line.trim();

    // Single #
    if (trimmed === '#') {return 'partial';}

    // Heading (# + space required)
    if (/^#+\s/.test(trimmed)) {return 'heading';}

    // Tag (# + non-space). Excludes lines starting with multiple '#' (e.g., headings)
    if (/^#\S/.test(trimmed) && !/^#{2,}\S/.test(trimmed)) {return 'tag';}

    return 'other';
}

// ----------------------------
// Code block detection (rule layer)
// ----------------------------

/**
 * Core rule: detect fence line
 * (shared by all implementations)
 */
function isFenceLine(line: string): boolean {
    return line.trim().startsWith('```');
}

// ----------------------------
// Code block detection (stream version)
// ----------------------------

export class CodeBlockTracker {
    private inCodeBlock = false;

    processLine(line: string): boolean {
        if (isFenceLine(line)) {
            this.inCodeBlock = !this.inCodeBlock;
            return false;
        }

        return !this.inCodeBlock;
    }
}

// ----------------------------
// Code block detection (realtime version)
// ----------------------------

function isInCodeBlock(lines: string[], currentLineIndex: number): boolean {
    let inCodeBlock = false;

    for (let i = 0; i <= currentLineIndex; i++) {
        if (isFenceLine(lines[i])) {
            inCodeBlock = !inCodeBlock;
        }
    }

    return inCodeBlock;
}

// ----------------------------
// Inline code normalization (centralized)
// ----------------------------

/**
 * IMPORTANT:
 * All inline code removal is centralized here.
 * Previously scattered across multiple functions.
 */
function normalizeInlineCode(line: string): string {
    return line.replace(/`[^`]*`/g, (match) => {
        return '@'.repeat(match.length);
    });
}

// ----------------------------
// Tag validation
// ----------------------------

function isTagLineValid(line: string, allowSingleHash = false): boolean {
    const safeLine = normalizeInlineCode(line);

    const tokens = safeLine.trim().split(/\s+/);

    for (const token of tokens) {
        if (token.length === 1) {
            if (token !== '#' || !allowSingleHash) {
                return false;
            }
        } else {
            if (!isTagToken(token)) {
                return false;
            }
        }
    }

    return true;
}

// ----------------------------
// Heading tag validation
// ----------------------------

function isHeadingTagPartValid(line: string, allowSingleHash = false): boolean {
    const safeLine = normalizeInlineCode(line);

    const match = safeLine.match(/^(#+)\s+(.*)$/);
    if (!match) { return false; }

    const rest = match[2];

    // Find tag start position (# + something)
    const tagStart = rest.search(/(^|[\s　])#/);

    if (tagStart === -1) {
        return true;
    }

    const tagPart = rest.slice(tagStart).trim();

    return isTagLineValid(tagPart, allowSingleHash);
}

// ----------------------------
// Tag extraction
// ----------------------------

export function getTagRanges(line: string): { start: number; end: number }[] {
    const safeLine = normalizeInlineCode(line);

    const ranges: { start: number; end: number }[] = [];
    const regex = /(^|\s)#([^\s#]+)/g;

    let match;

    while ((match = regex.exec(safeLine)) !== null) {
        const start = match.index + match[1].length;
        const end = start + match[2].length + 1; // includes '#'
        ranges.push({ start, end });
    }

    return ranges;
}

// ----------------------------
// Tag extraction (main API)
// ----------------------------

export function extractTags(line: string): string[] {
    const type = getLineType(line);

    // fast path
    if (type === 'other') {
        return [];
    }

    // tag validation
    if (type === 'tag' && !isTagLineValid(line, false)) {
        return [];
    }

    // heading validation
    if (type === 'heading' && !isHeadingTagPartValid(line, false)) {
        return [];
    }

    const ranges = getTagRanges(line);

    return ranges.map(r => line.slice(r.start + 1, r.end));
}

// ----------------------------
// Cursor helper
// ----------------------------

export function getCurrentTagAtCursor(textBefore: string): string | null {
    const ranges = getTagRanges(textBefore);

    if (ranges.length === 0) {
        return null;
    }

    const r = ranges[ranges.length - 1];

    return r.end === textBefore.length
        ? textBefore.slice(r.start + 1, r.end)
        : null;
}

// Determines if tag completion should be shown based on the context of multiple lines
export function shouldShowCompletionMultiLine(
    lines: string[],
    lineIndex: number
): boolean {

    // Code block guard (realtime check)
    if (isInCodeBlock(lines, lineIndex)) {
        return false;
    }

    const line = lines[lineIndex];
    const type = getLineType(line);

    if (type === 'other') {
        return false;
    }

    if (type === 'partial') {
        return true;
    }

    if (type === 'tag') {
        return isTagLineValid(line, true);
    }

    if (type === 'heading') {
        return isHeadingTagPartValid(line, true);
    }

    return false;
}
