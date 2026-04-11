// ============================
// Tag Logic Utilities
// ============================
import { FileMeta } from '../models/FileMeta';

// Regex for tag token (unchanged to preserve current behavior)
const TAG_REGEX = /#([\p{L}\p{N}_\-/ー]+)$/u;

// Determine if it is a tag token
export function isTagToken(token: string): boolean {
    return TAG_REGEX.test(token);
}

// Determine line type
export function getLineType(line: string): 'tag' | 'heading' | 'other' | 'partial' {
    const trimmed = line.trim();

    // Single #
    if (trimmed === '#') {return 'partial';}

    // Heading (# + space required)
    if (/^#+\s/.test(trimmed)) {return 'heading';}

    // Tag (# + non-space) *Excluding ##...
    if (/^#\S/.test(trimmed) && !/^#{2,}\S/.test(trimmed)) {return 'tag';}

    return 'other';
}

export class CodeBlockTracker {
  private inCodeBlock = false;

  processLine(line: string): boolean {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      this.inCodeBlock = !this.inCodeBlock;
      return false; // この行自体はタグ対象外にするなら
    }

    return !this.inCodeBlock;
  }
}

// Check tag line validity
function isTagLineValid(line: string, allowSingleHash = false): boolean {
    const tokens = line.trim().split(/\s+/);

    for (const token of tokens) {
        if (token.length === 1) {
            if (token !== '#' || !allowSingleHash) {return false;}
        } else {
            if (!isTagToken(token)) {return false;}
        }
    }

    return true;
}

// --------------------------------
// Code block detection
// --------------------------------
/** Determine if a line is inside a Markdown code block */
function isInCodeBlock(lines: string[], currentLineIndex: number): boolean {
    let inCodeBlock = false;

    for (let i = 0; i <= currentLineIndex; i++) {
        const line = lines[i].trim();

        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;  // toggle state
        }
    }

    return inCodeBlock;
}

// Check heading line validity (ignore title part)
function isHeadingTagPartValid(line: string, allowSingleHash = false): boolean {
    const match = line.match(/^(#+)\s+(.*)$/);
    if (!match) {return false;}

    const rest = match[2];

    // Find tag start position (# + something)
    const tagStart = rest.search(/(^|[\s　])#/);
    if (tagStart === -1) {return true;} // OK if no tag exists

    const tagPart = rest.slice(tagStart).trim();

    // Delegate to tag line validation here
    return isTagLineValid(tagPart, allowSingleHash);
}


// Extract tags
export function extractTags(line: string): string[] {
    const type = getLineType(line);
    if (type === 'other') {return [];}
    if (type === 'tag' && !isTagLineValid(line, false)) {return [];}
    if (type === 'heading' && !isHeadingTagPartValid(line, false)) {return [];}

    // Extract only tag parts
    const ranges = getTagRanges(line);
    return ranges.map(r => line.slice(r.start + 1, r.end)); // Remove "#"
}

// Get tag ranges
export function getTagRanges(line: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const regex = /(^|\s)#([^\s#]+)/g;

    let match;
    while ((match = regex.exec(line)) !== null) {
        const start = match.index + match[1].length;
        const end = start + match[2].length + 1; // Include "#"
        ranges.push({ start, end });
    }
    return ranges;
}

export function getCurrentTagAtCursor(textBefore: string): string | null {
    const ranges = getTagRanges(textBefore);
    if (ranges.length === 0) { return null; }

    const r = ranges[ranges.length - 1];
    return r.end === textBefore.length ? textBefore.slice(r.start + 1, r.end) : null;
}

// Determine completion
export function shouldShowCompletionMultiLine(
    lines: string[],
    lineIndex: number
): boolean {
    if (isInCodeBlock(lines, lineIndex)) { return false; } // code block check first

    const line = lines[lineIndex];
    const type = getLineType(line);

    // Immediately after "#" input
    if (type === 'other') {return false;}

    if (type === 'partial') {return true;}
    if (type === 'tag') {return isTagLineValid(line, true);}
    if (type === 'heading') {return isHeadingTagPartValid(line, true);}

    return false;
}
