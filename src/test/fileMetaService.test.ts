import * as assert from 'assert';
import { createFileMeta } from '../services/fileMetaService';

suite('fileMetaService tests', () => {

    test('extracts title from first heading', () => {
        const mockContent = `# My Title
#tag1 #tag2
`;
        const meta = createFileMeta('dummy.md', () => mockContent);

        assert.strictEqual(meta.title, 'My Title');
        assert.deepStrictEqual(meta.tags, ['tag1', 'tag2']);
    });

    test('uses file name if no heading', () => {
        const mockContent = `Some text
#tag3
`;
        const meta = createFileMeta('fileName.md', () => mockContent);

        assert.strictEqual(meta.title, 'fileName.md');
        assert.deepStrictEqual(meta.tags, ['tag3']);
    });

    test('ignores headings as tags', () => {
        const mockContent = `# Heading
#tag4 #tag5
# Another heading
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, ['tag4', 'tag5']);
    });

    test('headings tags', () => {
        const mockContent = `# Heading
## Another heading #tag4 #tag5

#tag6
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, ['tag4', 'tag5', 'tag6']);
    });

    test('hierarchy tags', () => {
        const mockContent = `# Heading
## Another heading

#tag4/tag5 #tag6
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, ['tag4/tag5', 'tag6']);
    });


});
