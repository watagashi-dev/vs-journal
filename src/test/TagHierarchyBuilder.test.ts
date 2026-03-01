import * as assert from 'assert';
import { TagHierarchyBuilder, TagHierarchyNode } from '../services/TagHierarchyBuilder';
import { FileInfo } from '../sidebar/TagTreeProvider';

suite('TagHierarchyBuilder Tests', () => {

    test('build returns flat node for single tag', () => {
        const builder = new TagHierarchyBuilder();
        const file: FileInfo = { filePath: '/file1.md', title: 'File 1' };
        const tagIndex = new Map<string, FileInfo[]>();
        tagIndex.set('tag1', [file]);
        const untagged: FileInfo[] = [];

        const nodes = builder.build(tagIndex, untagged);
        assert.strictEqual(nodes.length, 1);
        assert.strictEqual(nodes[0].name, 'tag1');
        assert.strictEqual(nodes[0].files[0].filePath, '/file1.md');
    });

    test('build splits tag path into hierarchy', () => {
        const builder = new TagHierarchyBuilder();
        const file: FileInfo = { filePath: '/file2.md', title: 'File 2' };
        const tagIndex = new Map<string, FileInfo[]>();
        tagIndex.set('level1/level2/level3', [file]);
        const untagged: FileInfo[] = [];

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
        const untaggedFile: FileInfo = { filePath: '/untagged.md', title: 'Untagged' };
        const nodes = builder.build(new Map(), [untaggedFile]);

        const untaggedNode = nodes.find(n => n.name === 'Untagged');
        assert.ok(untaggedNode);
        assert.strictEqual(untaggedNode!.files[0].filePath, '/untagged.md');
    });

    test('build truncates hierarchy beyond 4 levels', () => {
        const builder = new TagHierarchyBuilder();
        const file: FileInfo = { filePath: '/file.md', title: 'File' };
        const tagIndex = new Map<string, FileInfo[]>();
        tagIndex.set('a/b/c/d/e/f', [file]);

        const nodes = builder.build(tagIndex, []);
        const level1 = nodes[0];
        const level2 = level1.children.get('b')!;
        const level3 = level2.children.get('c')!;
        const level4 = level3.children.get('d/e/f')!;
        assert.strictEqual(level4.files[0].title, 'File');
    });
});
