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

    test('build returns flat node for single user tag', () => {
        const builder = new TagHierarchyBuilder();
        const file = createFileMetaStub('/file1.md', 'File 1');
        const userTagIndex = new Map<string, FileMeta[]>();
        userTagIndex.set('tag1', [file]);

        const result = builder.build(new Map(), userTagIndex, new Map());
        const nodes = result.user;
        assert.strictEqual(nodes.length, 1);
        assert.strictEqual(nodes[0].name, 'tag1');
        assert.strictEqual(nodes[0].files[0].filePath, '/file1.md');
    });

    test('build splits tag path into hierarchy', () => {
        const builder = new TagHierarchyBuilder();
        const file = createFileMetaStub('/file2.md', 'File 2');
        const userTagIndex = new Map<string, FileMeta[]>();
        userTagIndex.set('level1/level2/level3', [file]);

        const result = builder.build(new Map(), userTagIndex, new Map());
        const level1 = result.user[0];
        assert.strictEqual(level1.name, 'level1');
        const level2 = level1.children.get('level2');
        assert.ok(level2);
        const level3 = level2!.children.get('level3');
        assert.ok(level3);
        assert.strictEqual(level3!.files[0].title, 'File 2');
    });

    test('build truncates hierarchy beyond 4 levels', () => {
        const builder = new TagHierarchyBuilder();
        const file = createFileMetaStub('/file.md', 'File');
        const userTagIndex = new Map<string, FileMeta[]>();
        userTagIndex.set('a/b/c/d/e/f', [file]);

        const result = builder.build(new Map(), userTagIndex, new Map());
        const level1 = result.user[0];
        const level2 = level1.children.get('b')!;
        const level3 = level2.children.get('c')!;
        const level4 = level3.children.get('d/e/f')!;
        assert.strictEqual(level4.files[0].title, 'File');
    });

    test('build includes system tags even if empty', () => {
        const builder = new TagHierarchyBuilder();
        const systemTagIndex = new Map<string, FileMeta[]>();
        systemTagIndex.set('today', []); // 空でも存在させる

        const result = builder.build(systemTagIndex, new Map(), new Map());
        const systemNodes = result.system;
        assert.strictEqual(systemNodes.length, 1);
        assert.strictEqual(systemNodes[0].name, 'today');
        assert.strictEqual(systemNodes[0].files.length, 0);
    });

    test('build includes system tag with file', () => {
        const builder = new TagHierarchyBuilder();
        const systemFile = createFileMetaStub('/system.md', 'System File');
        const systemTagIndex = new Map<string, FileMeta[]>();
        systemTagIndex.set('today', [systemFile]);

        const result = builder.build(systemTagIndex, new Map(), new Map());
        const systemNodes = result.system;
        const node = systemNodes.find(n => n.name === 'today')!;
        assert.ok(node);
        assert.strictEqual(node.files[0].filePath, '/system.md');
    });

    test('user files are sorted alphabetically', () => {
        const builder = new TagHierarchyBuilder();
        const userTagIndex = new Map<string, FileMeta[]>();
        userTagIndex.set('tag', [
            createFileMetaStub('/b.md', 'b'),
            createFileMetaStub('/a.md', 'a')
        ]);

        const result = builder.build(new Map(), userTagIndex, new Map());
        const files = result.user[0].files;
        assert.strictEqual(files[0].title, 'a');
        assert.strictEqual(files[1].title, 'b');
    });

    test('tags are sorted alphabetically', () => {
        const builder = new TagHierarchyBuilder();

        const fileA = createFileMetaStub('/fileA.md', 'A');
        const fileB = createFileMetaStub('/fileB.md', 'B');

        const userTagIndex = new Map<string, FileMeta[]>();
        userTagIndex.set('zeta', [fileA]);
        userTagIndex.set('alpha', [fileB]);

        const result = builder.build(new Map(), userTagIndex, new Map());
        const tagNames = result.user.map(n => n.name);
        assert.deepStrictEqual(tagNames, ['alpha', 'zeta']);
    });

    test('hierarchy children are sorted alphabetically', () => {
        const builder = new TagHierarchyBuilder();

        const fileA = createFileMetaStub('/fileA.md', 'A');
        const fileB = createFileMetaStub('/fileB.md', 'B');

        const userTagIndex = new Map<string, FileMeta[]>();
        userTagIndex.set('b/child2', [fileA]);
        userTagIndex.set('b/child1', [fileB]);

        const result = builder.build(new Map(), userTagIndex, new Map());
        const bNode = result.user.find(n => n.name === 'b')!;
        const childNames = Array.from(bNode.children.keys());
        assert.deepStrictEqual(childNames, ['child1', 'child2']);
    });

});
