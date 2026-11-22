import * as assert from 'assert';
import { HeadingMeta } from '../models/FileMeta';
import { filterHeadingsForTag } from '../services/headingTagFilter';

function createHeading(
    rawText: string,
    tags: string[] = []
): HeadingMeta {
    return {
        text: rawText,
        rawText,
        level: 2,
        line: 0,
        tags
    };
}

suite('headingTagFilter tests', () => {
    test('user tags match heading tags exactly', () => {
        const matching = createHeading('## A heading', ['topic/sub']);
        const similar = createHeading('## Similar tag', ['topic/subtopic']);
        const rawTextOnly = createHeading('## #topic/sub');

        const result = filterHeadingsForTag(
            [matching, similar, rawTextOnly],
            'user',
            'topic/sub',
            false
        );

        assert.deepStrictEqual(result, [matching]);
    });

    test('virtual tags match heading raw text using case sensitivity setting', () => {
        const heading = createHeading('## Topic/Sub heading');

        assert.deepStrictEqual(
            filterHeadingsForTag([heading], 'virtual', 'topic/sub', true),
            []
        );
        assert.deepStrictEqual(
            filterHeadingsForTag([heading], 'virtual', 'topic/sub', false),
            [heading]
        );
    });

    test('system tags do not return headings', () => {
        const heading = createHeading('## Today', ['Today']);

        assert.deepStrictEqual(
            filterHeadingsForTag([heading], 'system', 'Today', false),
            []
        );
    });
});
