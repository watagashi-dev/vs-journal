import * as assert from 'assert';
import {
    shouldShowCompletionMultiLine,
    getTagRangesForDisplay,
    extractTags,
    isTagToken,
    isTaggableTextToken
} from '../services/tagLogic';

function assertEqual(actual: any, expected: any, input: string) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);

    if (!pass) {
        throw new Error(`
            INPUT: ${input}
            ACTUAL:   ${actual.map((t: string) => `[${t}]`).join(' ')}
            EXPECTED: ${expected.map((t: string) => `[${t}]`).join(' ')}
        `);
    }
}

function runCompletionTest(input: string, expected: boolean) {
    const line = input.replace('|', '');
    const lines = [line];       // single line as array
    const lineIndex = 0;        // Test the first line (index 0)

    const result = shouldShowCompletionMultiLine(lines, lineIndex);
    assert.strictEqual(result, expected, input);
}

function runMultiLineCompletionTest(linesWithCursor: string[], expected: boolean) {
    let lineIndex = -1;
    let cursor = -1;

    // Find the line with '|'
    const lines = linesWithCursor.map((line, i) => {
        const pos = line.indexOf('|');
        if (pos !== -1) {
            lineIndex = i;
            return line.replace('|', '');
        }
        return line;
    });

    if (lineIndex === -1) {
        throw new Error("Cursor '|' not found in any line");
    }

    const result = shouldShowCompletionMultiLine(lines, lineIndex);
    assert.strictEqual(result, expected, `Line ${lineIndex}`);
}

function runExtractTest(line: string, expected: string[]) {
    const result = extractTags(line);
    assertEqual(result, expected, line);
}

function runValidationTest(line: string, expected: boolean) {
    const result = isTagToken(line);
    assert.strictEqual(result, expected);
}

function runTaggableTest(
    content: string,
    isHeading: boolean,
    expected: boolean
) {
    const actual = isTaggableTextToken(
        content,
        {
            isHeading,
        }
    );

    assert.strictEqual(
        actual,
        expected,
        `
CONTENT : ${content}
HEADING : ${isHeading}
EXPECTED: ${expected}
ACTUAL  : ${actual}
`
    );
}

function runDisplayExtractTest(
    line: string,
    expected: string[]
) {
    const ranges =
        getTagRangesForDisplay(line);

    const actual =
        ranges.map((r) =>
            line
                .slice(r.start + 1, r.end)
        );

    assertEqual(
        actual,
        expected,
        line
    );
}

suite('Tag Logic Tests', () => {

    test('tag validation', () => {
        runValidationTest('#oktag', true);
        runValidationTest('#tag1', true);
        runValidationTest('#layer1/layer2', true);
        runValidationTest('#ngtag+', false);
        runValidationTest('#oktag-', true);
        runValidationTest('#oktag_', true);
        runValidationTest('#リリース', true);
        runValidationTest('#台鐵', true);
        runValidationTest('#@foo', false);
        runValidationTest('#fo@o', false);
        runValidationTest('#foo@', false);
        runValidationTest('#foo＠', false);
        runValidationTest('#fo＠o', false);
        runValidationTest('#layer1／layer2', false);
    });

    test('completion', () => {
        runCompletionTest('#|', true);
        runCompletionTest('#tag1 #|', true);
        runCompletionTest('#tag1 #t|', true);
        runCompletionTest('# title #|', true);
        runCompletionTest('# title #tag1 #|', true);
        runCompletionTest('## title #|', true);
        runCompletionTest('## title #t|', true);
        runCompletionTest('#t|', true);
        runCompletionTest('# title foo #|', true);

        runCompletionTest('##|', false);
        runCompletionTest('## title ##|', false);
        runCompletionTest('text #|', false);
        runCompletionTest('# title # foo #|', false);

        // Invalid tag format (mixed content)
        runCompletionTest('#tag1 foo #|', false);
        runCompletionTest('test foo #|', false);
        runCompletionTest('# test #tag1 hoge #|', false);

        // OK
        runCompletionTest('#tag1　#|', true);
        runCompletionTest('#タグ1 #|', true);
    });

    test('completion multi line', () => {
        runMultiLineCompletionTest([
            "# Heading",
            "Some text",
            "```js",
            "#if 0",
            "void main()",
            "#else",
            "int main()",
            "#endif",
            "```",
            "#タグ1 #|"
        ], true); // Completion should be triggered for the tag on the last line

        runMultiLineCompletionTest([
            "# Heading",
            "```js",
            "#if 0",
            "#|",
            "#else",
            "#endif",
            "```"
        ], false); // No completion inside code blocks
    });

    test('extract', () => {
        runExtractTest('#tag1 #tag2', ['tag1', 'tag2']);
        runExtractTest('# title #tag1 #tag2', ['tag1', 'tag2']);
        runExtractTest('# title foo #tag', ['tag']);
        runExtractTest('# title foo \` #tag1\` #tag2', ['tag2']);
        runExtractTest('# title foo #tag1 `\ #tag2 \`', []);
        runExtractTest('\` #tag1\` #tag2', []);
        runExtractTest('#tag1 \` #tag2 \`', []);

        // Invalid tag format (mixed content)
        runExtractTest('#tag1 foo #tag2', []);
        runExtractTest('#tag1 # #tag2', []);
        runExtractTest('# title # foo #tag', []);

        // Mid-sentence
        runExtractTest('text #tag', []);

        // Unicode
        runExtractTest('#tag1　#tag2', ['tag1', 'tag2']);
        runExtractTest('#リリース', ['リリース']);
        runExtractTest(
            '## 見出し2 ` #NG-tag3000 ` #OK-tag4000',
            ['OK-tag4000']
        );

        runExtractTest(
            '## 見出し3 #NG-tag5000 ` #NG-tag6000 `',
            []
        );

        runExtractTest(
            '#NG-tag1000 ` #NG-tag2000 `',
            []
        );
    });

    test('taggable text token', () => {

        // normal tag line
        runTaggableTest(
            '#tag1 #tag2',
            false,
            true
        );

        // mixed content -> invalid
        runTaggableTest(
            '#tag1 text #tag2',
            false,
            false
        );

        // heading with tag
        runTaggableTest(
            'heading #tag1',
            true,
            true
        );

        runTaggableTest(
            'heading #tag1 #tag2',
            true,
            true
        );

        // heading without tag
        runTaggableTest(
            'heading text',
            true,
            true
        );

        // heading with invalid tag section
        runTaggableTest(
            'heading # tag1',
            true,
            true
        );

        // inline code already normalized by validator
        runTaggableTest(
            'heading ` #tag1 ` #tag2',
            true,
            true
        );
    });

    test('display tag extraction', () => {

        runDisplayExtractTest(
            '## 見出し2 ` #NG-tag3000 ` #OK-tag4000',
            ['OK-tag4000']
        );

        runDisplayExtractTest(
            '` #NG-tag1 `',
            []
        );
    });
});
