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

    test('simple match', () => {
        virtualTagSet.add('foo');

        const content = `hello
foo bar
baz`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content);

        const files = virtualTagIndexMap.get('foo');
        assert.ok(files);
        assert.strictEqual(files!.length, 1);
        assert.strictEqual(files![0].filePath, 'a.md');
    });

    test('multiple hits in one file', () => {
        virtualTagSet.add('foo');

        const content = `foo
bar
foo`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content);

        const files = virtualTagIndexMap.get('foo')!;
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].filePath, 'a.md');
    });

    test('multiple tags', () => {
        virtualTagSet.add('foo');
        virtualTagSet.add('bar');

        const content = `foo
bar
foobar`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content);

        const fooFiles = virtualTagIndexMap.get('foo')!;
        const barFiles = virtualTagIndexMap.get('bar')!;

        assert.strictEqual(fooFiles.length, 1);
        assert.strictEqual(barFiles.length, 1);
    });

    test('no match', () => {
        virtualTagSet.add('foo');

        const content = `hello world`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content);

        assert.strictEqual(virtualTagIndexMap.has('foo'), false);
        assert.strictEqual(virtualTagIndexMap.has('foo'), false);
    });

    test('multiple files', () => {
        virtualTagSet.add('foo');

        const meta1 = createMeta('a.md');
        const meta2 = createMeta('b.md');

        indexVirtualTags(meta1, 'foo');
        indexVirtualTags(meta2, 'no match');

        const files = virtualTagIndexMap.get('foo')!;
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].filePath, 'a.md');
    });

    test('japanese match', () => {
        virtualTagSet.add('仮想タグ');

        const content = `今日は仮想タグのテスト`;

        const meta = createMeta('a.md');

        indexVirtualTags(meta, content);

        const files = virtualTagIndexMap.get('仮想タグ')!;
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].filePath, 'a.md');
    });
});
