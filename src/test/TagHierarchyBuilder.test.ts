import * as assert from 'assert';
import { TagHierarchyBuilder, TagHierarchyNode } from '../services/TagHierarchyBuilder';
import { FileMeta } from "../models/FileMeta";

suite('TagHierarchyBuilder Tests', () => {

    function createFileMetaStub(filePath: string, title: string): FileMeta {
        const fileName = filePath.split('/').pop() || '';

        return {
            filePath,
            fileName,
            title,
            tags: [],
            ctime: Date.now(),
            mtime: Date.now(),
            size: 789
        };
    }

    test('build returns flat node for single tag', () => {
        const builder = new TagHierarchyBuilder();
        const file = createFileMetaStub('/file1.md', 'File 1');
        const tagIndex = new Map<string, FileMeta[]>();
        tagIndex.set('tag1', [file]);
        const untagged: FileMeta[] = [];

        const nodes = builder.build(tagIndex, untagged);
        assert.strictEqual(nodes.length, 1);
        assert.strictEqual(nodes[0].name, 'tag1');
        assert.strictEqual(nodes[0].files[0].filePath, '/file1.md');
    });

    test('build splits tag path into hierarchy', () => {
        const builder = new TagHierarchyBuilder();
        const file = createFileMetaStub('/file2.md', 'File 2');
        const tagIndex = new Map<string, FileMeta[]>();
        tagIndex.set('level1/level2/level3', [file]);
        const untagged: FileMeta[] = [];

        const nodes = builder.build(tagIndex, untagged);
        assert.strictEqual(nodes.length, 1);
        const level1 = nodes[0];
        assert.strictEqual(level1.name, 'level1');
        const level2 = level1.children.get('level2');
        assert.ok(level2);
        const level3 = level2!.children.get('level3');
        assert.ok(level3);
        assert.strictEqual(level3!.files[0].title, 'File 2');
    });

    test('build adds untagged node', () => {
        const builder = new TagHierarchyBuilder();
        const untaggedFile = createFileMetaStub('/untagged.md', 'Untagged');
        const nodes = builder.build(new Map(), [untaggedFile]);

        const untaggedNode = nodes.find(n => n.name === 'Untagged');
        assert.ok(untaggedNode);
        assert.strictEqual(untaggedNode!.files[0].filePath, '/untagged.md');
    });

    test('build truncates hierarchy beyond 4 levels', () => {
        const builder = new TagHierarchyBuilder();
        const file = createFileMetaStub('/file.md', 'File');
        const tagIndex = new Map<string, FileMeta[]>();
        tagIndex.set('a/b/c/d/e/f', [file]);

        const nodes = builder.build(tagIndex, []);
        const level1 = nodes[0];
        const level2 = level1.children.get('b')!;
        const level3 = level2.children.get('c')!;
        const level4 = level3.children.get('d/e/f')!;
        assert.strictEqual(level4.files[0].title, 'File');
    });

    test('basic alphabetical sort', () => {
        const builder = new TagHierarchyBuilder();

        const tagIndex = new Map<string, FileMeta[]>();
        tagIndex.set('tag', [
            createFileMetaStub('/b.md', 'b'),
            createFileMetaStub('/a.md', 'a')
        ]);

        const nodes = builder.build(tagIndex, []);
        const files = nodes[0].files;

        assert.strictEqual(files[0].title, 'a');
        assert.strictEqual(files[1].title, 'b');
    });

    test('case sensitivity (A vs a)', () => {
        const builder = new TagHierarchyBuilder();

        const tagIndex = new Map<string, FileMeta[]>();
        tagIndex.set('tag', [
            createFileMetaStub('/a.md', 'a'),
            createFileMetaStub('/b.md', 'b'),
            createFileMetaStub('/A.md', 'A'),
            createFileMetaStub('/B.md', 'B')
        ]);

        const files = builder.build(tagIndex, [])[0].files;

        // 文字列ソートなのでこうなる
        assert.deepStrictEqual(
            files.map(f => f.title),
            ['a', 'A', 'b', 'B']
        );
    });

    test('tags are sorted alphabetically', () => {
        const builder = new TagHierarchyBuilder();

        const fileA = createFileMetaStub('/fileA.md', 'A');
        const fileB = createFileMetaStub('/fileB.md', 'B');

        const tagIndex = new Map<string, FileMeta[]>();
        tagIndex.set('zeta', [fileA]);
        tagIndex.set('alpha', [fileB]);
        const untagged: FileMeta[] = [];

        const nodes = builder.build(tagIndex, untagged);

        // ルートレベルでタグ順になっているか
        const tagNames = nodes.map(n => n.name);
        assert.deepStrictEqual(tagNames, ['alpha', 'zeta']);

        // 子ノードがある場合も同様に確認可能
        // 例: 階層タグ
        tagIndex.clear();
        tagIndex.set('b/child2', [fileA]);
        tagIndex.set('b/child1', [fileB]);

        const nodes2 = builder.build(tagIndex, []);
        const bNode = nodes2.find(n => n.name === 'b')!;
        const childNames = Array.from(bNode.children.keys());
        assert.deepStrictEqual(childNames, ['child1', 'child2']);
    });
});