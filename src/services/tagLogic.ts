const TAG_BODY = '[\\p{L}\\p{N}_\\-／/ー]+';
const TAG_REGEX = new RegExp(`#(${TAG_BODY})`, 'u');

// 行をトークン化して余計な空白を削除
function normalize(line: string): string {
    return line.trim();
}

// タグトークンかどうか判定
function isTagToken(token: string): boolean {
    return TAG_REGEX.test(token);
}

// 行タイプ判定
export function getLineType(line: string): 'tag' | 'heading' | 'other' | 'partial' {
    const trimmed = line.trim();

    // 単独 #
    if (trimmed === '#') {return 'partial';}

    // 見出し（# + space 必須）
    if (/^#+\s/.test(trimmed)) {return 'heading';}

    // タグ（# + 非スペース）※ただし ##... は除外
    if (/^#\S/.test(trimmed) && !/^#{2,}\S/.test(trimmed)) {return 'tag';}

    return 'other';
}

// タグ行の正当性チェック
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

// 見出し行の正当性チェック（タイトル部分は無視）
function isHeadingTagPartValid(line: string, allowSingleHash = false): boolean {
    const match = line.match(/^(#+)\s+(.*)$/);
    if (!match) {return false;}

    const rest = match[2];

    // タグ開始位置を探す（# + 何か）
    const tagStart = rest.search(/(^|[\s　])#/);
    if (tagStart === -1) {return true;} // タグがないならOK

    const tagPart = rest.slice(tagStart).trim();

    // ここでタグ行バリデーションに委譲
    return isTagLineValid(tagPart, allowSingleHash);
}


// タグ抽出
export function extractTags(line: string): string[] {
    const type = getLineType(line);
    if (type === 'other') {return [];}
    if (type === 'tag' && !isTagLineValid(line, false)) {return [];}
    if (type === 'heading' && !isHeadingTagPartValid(line, false)) {return [];}

    // タグ部分のみ抽出
    const ranges = getTagRanges(line);
    return ranges.map(r => line.slice(r.start + 1, r.end)); // "#"除去
}

// タグ範囲取得
export function getTagRanges(line: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const regex = /(^|\s)#([^\s#]+)/g;

    let match;
    while ((match = regex.exec(line)) !== null) {
        const start = match.index + match[1].length;
        const end = start + match[2].length + 1; // "#"含む
        ranges.push({ start, end });
    }
    return ranges;
}

// 補完判定
export function shouldShowCompletion(line: string, cursor: number): boolean {
    const before = line.slice(0, cursor);
    const type = getLineType(line);

    // "#" 入力直後
    if (type === 'other') {return false;}

    if (type === 'partial') {return true;}
    if (type === 'tag') {return isTagLineValid(line, true);}
    if (type === 'heading') {return isHeadingTagPartValid(line, true);}

    // タグの途中
    const ranges = getTagRanges(line);
    return ranges.some(r => cursor >= r.start && cursor <= r.end);
}
