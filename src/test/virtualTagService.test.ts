import * as assert from 'assert';
import { indexVirtualTags } from '../services/virtualTagService';
import { FileMeta } from '../models/FileMeta';

import {
    virtualTagSet,
    virtualTagIndexMap,
} from '../state';

function createMeta(filePath: string): FileMeta {
    return {
        filePath,
        fileName: filePath,
        title: filePath,
        tags: [],
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
        assert.strictEqual(files!.length, 1);
        assert.strictEqual(files![0].filePath, 'a.md');
    });

    test('multiple hits in one file (case sensitive)', () => {
        virtualTagSet.add('foo');

        const content = `foo
bar
foo`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        const files = virtualTagIndexMap.get('foo')!;
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].filePath, 'a.md');
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

        assert.strictEqual(fooFiles.length, 1);
        assert.strictEqual(barFiles.length, 1);
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
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].filePath, 'a.md');
    });

    test('japanese match (case sensitive)', () => {
        virtualTagSet.add('仮想タグ');

        const content = `今日は仮想タグのテスト`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content, true);

        const files = virtualTagIndexMap.get('仮想タグ')!;
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].filePath, 'a.md');
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
        assert.strictEqual(files.length, 1);
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

        assert.strictEqual(fooFiles.length, 1);
        assert.strictEqual(barFiles.length, 1);
    });
});
