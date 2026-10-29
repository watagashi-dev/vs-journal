import * as assert from 'assert';
import {
    indexVirtualTags,
    buildTagSegments,
    TagSegment
} from '../services/virtualTagService';
import { FileMeta } from '../models/FileMeta';
import {
    virtualTagSet,
    virtualTagIndexMap,
} from '../state';

/**
 * Experimental RegExp-based implementation for comparison.
 */
function buildTagSegmentsWithRegExp(
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

    const escapedKeyword = keyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
    );

    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(escapedKeyword, flags);

    const segments: TagSegment[] = [];
    let position = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > position) {
            segments.push({
                text: content.slice(position, match.index),
                virtualTag: false
            });
        }

        segments.push({
            text: match[0],
            virtualTag: true
        });

        position = match.index + match[0].length;
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

function createMeta(filePath: string): FileMeta {
    return {
        filePath,
        fileName: filePath,
        title: filePath,
        tags: [],
        headings: [],
        ctime: 0,
        mtime: 0,
        size: 0
    };
}

suite('virtualTagService tests', () => {

    setup(() => {
        virtualTagSet.clear();
        virtualTagIndexMap.clear();
    });

    test('simple match (case sensitive)', () => {
        virtualTagSet.add('foo');

        const content = `hello
foo bar
baz`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        const files = virtualTagIndexMap.get('foo');
        assert.ok(files);
        assert.strictEqual(files!.size, 1);

        const file = Array.from(files!.values())[0];
        assert.strictEqual(file.meta.filePath, 'a.md');
    });

    test('multiple hits in one file (case sensitive)', () => {
        virtualTagSet.add('foo');

        const content = `foo
bar
foo`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        const files = virtualTagIndexMap.get('foo')!;
        assert.strictEqual(files.size, 1);

        const file = Array.from(files.values())[0];
        assert.strictEqual(file.meta.filePath, 'a.md');
    });

    test('multiple tags (case sensitive)', () => {
        virtualTagSet.add('foo');
        virtualTagSet.add('bar');

        const content = `foo
bar
foobar`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        const fooFiles = virtualTagIndexMap.get('foo')!;
        const barFiles = virtualTagIndexMap.get('bar')!;

        assert.strictEqual(fooFiles.size, 1);
        assert.strictEqual(barFiles.size, 1);
    });

    test('no match (case sensitive)', () => {
        virtualTagSet.add('foo');

        const content = `hello world`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        assert.strictEqual(virtualTagIndexMap.has('foo'), false);
    });

    test('multiple files (case sensitive)', () => {
        virtualTagSet.add('foo');

        const meta1 = createMeta('a.md');
        const meta2 = createMeta('b.md');

        indexVirtualTags(meta1, 'foo', true);
        indexVirtualTags(meta2, 'no match', true);

        const files = virtualTagIndexMap.get('foo')!;
        assert.strictEqual(files.size, 1);

        const file = Array.from(files.values())[0];
        assert.strictEqual(file.meta.filePath, 'a.md');
    });

    test('japanese match (case sensitive)', () => {
        virtualTagSet.add('仮想タグ');

        const content = `今日は仮想タグのテスト`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        const files = virtualTagIndexMap.get('仮想タグ')!;
        assert.strictEqual(files.size, 1);

        const file = Array.from(files.values())[0];
        assert.strictEqual(file.meta.filePath, 'a.md');
    });

    // =========================
    // Case insensitive tests
    // =========================

    test('case insensitive match', () => {
        virtualTagSet.add('foo');

        const content = `FOO bar`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, false);

        const files = virtualTagIndexMap.get('foo')!;
        assert.strictEqual(files.size, 1);
    });

    test('case insensitive no match when different string', () => {
        virtualTagSet.add('foo');

        const content = `bar baz`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, false);

        assert.strictEqual(virtualTagIndexMap.has('foo'), false);
    });

    test('case sensitive should not match different case', () => {
        virtualTagSet.add('foo');

        const content = `FOO bar`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        assert.strictEqual(virtualTagIndexMap.has('foo'), false);
    });

    test('multiple tags case insensitive', () => {
        virtualTagSet.add('foo');
        virtualTagSet.add('bar');

        const content = `FOO BAR`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, false);

        const fooFiles = virtualTagIndexMap.get('foo')!;
        const barFiles = virtualTagIndexMap.get('bar')!;

        assert.strictEqual(fooFiles.size, 1);
        assert.strictEqual(barFiles.size, 1);
    });
});

// =========================
// buildTagSegments tests
// =========================

test('buildTagSegments no keyword', () => {

    const result = buildTagSegments(
        '#virtualTag',
        undefined,
        false
    );

    assert.deepStrictEqual(result, [
        {
            text: '#virtualTag',
            virtualTag: false
        }
    ]);
});

test('buildTagSegments no match', () => {

    const result = buildTagSegments(
        '#test1',
        'virtual',
        false
    );

    assert.deepStrictEqual(result, [
        {
            text: '#test1',
            virtualTag: false
        }
    ]);
});

test('buildTagSegments match in middle', () => {

    const result = buildTagSegments(
        '#virtualTag',
        'virtual',
        false
    );

    assert.deepStrictEqual(result, [
        {
            text: '#',
            virtualTag: false
        },
        {
            text: 'virtual',
            virtualTag: true
        },
        {
            text: 'Tag',
            virtualTag: false
        }
    ]);
});

test('buildTagSegments full match', () => {

    const result = buildTagSegments(
        'virtual',
        'virtual',
        false
    );

    assert.deepStrictEqual(result, [
        {
            text: 'virtual',
            virtualTag: true
        }
    ]);
});

test('buildTagSegments match at end', () => {

    const result = buildTagSegments(
        '#myvirtual',
        'virtual',
        false
    );

    assert.deepStrictEqual(result, [
        {
            text: '#my',
            virtualTag: false
        },
        {
            text: 'virtual',
            virtualTag: true
        }
    ]);
});

test('buildTagSegments case insensitive', () => {

    const result = buildTagSegments(
        '#VirtualTag',
        'virtual',
        false
    );

    assert.deepStrictEqual(result, [
        {
            text: '#',
            virtualTag: false
        },
        {
            text: 'Virtual',
            virtualTag: true
        },
        {
            text: 'Tag',
            virtualTag: false
        }
    ]);
});

test('buildTagSegments case sensitive no match', () => {

    const result = buildTagSegments(
        '#VirtualTag',
        'virtual',
        true
    );

    assert.deepStrictEqual(result, [
        {
            text: '#VirtualTag',
            virtualTag: false
        }
    ]);
});

test('buildTagSegments japanese match', () => {

    const result = buildTagSegments(
        '#仮想タグテスト',
        '仮想タグ',
        true
    );

    assert.deepStrictEqual(result, [
        {
            text: '#',
            virtualTag: false
        },
        {
            text: '仮想タグ',
            virtualTag: true
        },
        {
            text: 'テスト',
            virtualTag: false
        }
    ]);
});

test('buildTagSegments multi match', () => {

    const result = buildTagSegments(
        '#virtualTagvirtual',
        'virtual',
        true
    );

    assert.deepStrictEqual(result, [
        {
            text: '#',
            virtualTag: false
        },
        {
            text: 'virtual',
            virtualTag: true
        },
        {
            text: 'Tag',
            virtualTag: false
        },
        {
            text: 'virtual',
            virtualTag: true
        }
    ]);
});

// =========================
// Experimental RegExp comparison tests
// =========================

test('RegExp comparison: basic matching', () => {
    const content = '#virtualTag test virtual';
    const keyword = 'virtual';

    const current = buildTagSegments(
        content,
        keyword,
        true
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        true
    );

    assert.deepStrictEqual(experimental, current);
});

test('RegExp comparison: case insensitive', () => {
    const content = '#VirtualTag #VIRTUAL #virtual';
    const keyword = 'virtual';

    const current = buildTagSegments(
        content,
        keyword,
        false
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        false
    );

    assert.deepStrictEqual(experimental, current);
});

test('RegExp comparison: Japanese', () => {
    const content = '#仮想タグテスト 仮想タグ';
    const keyword = '仮想タグ';

    const current = buildTagSegments(
        content,
        keyword,
        true
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        true
    );

    assert.deepStrictEqual(experimental, current);
});

test('RegExp comparison: special characters', () => {
    const content = 'test.* test+ test.*';
    const keyword = '.*';

    const current = buildTagSegments(
        content,
        keyword,
        true
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        true
    );

    assert.deepStrictEqual(experimental, current);
});

test('RegExp comparison: multiple matches', () => {
    const content = 'abcabcabc';
    const keyword = 'abc';

    const current = buildTagSegments(
        content,
        keyword,
        true
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        true
    );

    assert.deepStrictEqual(experimental, current);
});

test('RegExp comparison: Unicode lowercase length change', () => {
    const content = 'İvirtual';
    const keyword = 'virtual';

    const current = buildTagSegments(
        content,
        keyword,
        false
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        false
    );

    assert.deepStrictEqual(experimental, current);
});

test('RegExp comparison: Unicode case folding difference', () => {
    const content = 'İ';
    const keyword = 'i';

    const current = buildTagSegments(
        content,
        keyword,
        false
    );

    const experimental = buildTagSegmentsWithRegExp(
        content,
        keyword,
        false
    );

    console.log('Current:', current);
    console.log('RegExp:', experimental);
});