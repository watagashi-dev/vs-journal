import * as assert from 'assert';
import { createFileMeta } from '../services/fileMetaService';

function assertTags(actual: string[], expected: string[], label = '') {
    const fmt = (arr: string[]) =>
        arr.map((t: string) => `[${t}]`).join(' ');

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`
            ${label}
            ACTUAL:   ${fmt(actual)}
            EXPECTED: ${fmt(expected)}
        `);
    }
}


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

    test('headings tag with inline code block', () => {
        const mockContent = `# Heading
## Another heading \` #tag4 #tag5 \`

#tag6
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, ['tag6']);
    });

    test('headings tag with inline code block-2', function () {
        const label = (this.test && this.test.title) || '';
        const mockContent = `# Heading
## Another heading \` #tag4\` #tag5

#tag6
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assertTags(meta.tags, ['tag5', 'tag6'], label);
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

    test('inside code block tags 1', () => {
        const mockContent = `# Heading
## Another heading

\`\`\`
#if 0
void main(int argc, char *argv[])
#else
inv main(int argc, char *argv[])
#endif
\`\`\`
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, []);
    });

    test('inside code block tags 2', () => {
        const mockContent = `# Heading
## Another heading

\`\`\`
    #if 0
    main(int argc, char *argv[])
    #else
    main(int argc, char *argv[])
    #endif
\`\`\`
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, []);
    });

    test('outside code block tags 1', () => {
        const mockContent = `# Heading
## Another heading

\`\`\`
    #if 0
    main(int argc, char *argv[])
    #else
    main(int argc, char *argv[])
\`\`\`

#endif
`;
        const meta = createFileMeta('test.md', () => mockContent);

        assert.strictEqual(meta.title, 'Heading');
        assert.deepStrictEqual(meta.tags, ['endif']);
    });
});
