import * as assert from 'assert';
import { sortFiles } from '../services/fileSort';
import { FileMeta } from '../models/FileMeta';

function createStub(title: string): FileMeta {
    return {
        filePath: `/${title}.md`,
        fileName: `${title}.md`,
        title,
        tags: [],
        ctime: 0,
        mtime: 0,
        size: 0
    };
}

suite('fileSort tests', () => {

    test('title basic sort', () => {
        const files = [
            createStub('b'),
            createStub('a'),
            createStub('c')
        ];

        const result = sortFiles(files);

        assert.deepStrictEqual(
            result.map(f => f.title),
            ['a', 'b', 'c']
        );
    });

    test('numbers as strings', () => {
        const files = [
            createStub('10'),
            createStub('2'),
            createStub('1')
        ];

        const result = sortFiles(files);

        assert.deepStrictEqual(
            result.map(f => f.title),
            ['1', '10', '2']
        );
    });

    test('case sensitivity', () => {
        const files = [
            createStub('A'),
            createStub('a')
        ];

        const result = sortFiles(files);

        assert.deepStrictEqual(
            result.map(f => f.title),
            ['a', 'A']
        );
    });

    test('symbols', () => {
        const files = [
            createStub('_a'),
            createStub('-a'),
            createStub('a')
        ];

        const result = sortFiles(files);

        // localeCompareの結果に合わせる
        assert.deepStrictEqual(
            result.map(f => f.title),
            ['_a', '-a', 'a']
        );
    });

    test('mtime desc', () => {
        const files = [
            { ...createStub('a'), mtime: 1 },
            { ...createStub('b'), mtime: 3 },
            { ...createStub('c'), mtime: 2 }
        ];

        const result = sortFiles(files, 'mtime', 'desc');

        assert.deepStrictEqual(
            result.map(f => f.title),
            ['b', 'c', 'a']
        );
    });
});
