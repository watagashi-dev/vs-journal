import * as assert from 'assert';
import { shouldShowCompletion, extractTags } from '../services/tagLogic';

function runCompletionTest(input: string, expected: boolean) {
    const cursor = input.indexOf('|');
    const line = input.replace('|', '');
    const result = shouldShowCompletion(line, cursor);

    assert.strictEqual(result, expected, input);
}

function runExtractTest(line: string, expected: string[]) {
    const result = extractTags(line);
    assert.deepStrictEqual(result, expected, line);
}

suite('Tag Logic Tests', () => {

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

        // 純粋性NG
        runCompletionTest('#tag1 foo #|', false);
        runCompletionTest('test foo #|', false);
        runCompletionTest('# test #tag1 hoge #|', false);

        // OK
        runCompletionTest('#tag1　#|', true);
        runCompletionTest('#タグ1 #|', true);
    });

    test('extract', () => {

        runExtractTest('#tag1 #tag2', ['tag1', 'tag2']);
        runExtractTest('# title #tag1 #tag2', ['tag1', 'tag2']);
        runExtractTest('# title foo #tag', ['tag']);

        // 純粋性NG
        runExtractTest('#tag1 foo #tag2', []);
        runExtractTest('#tag1 # #tag2', []);
        runExtractTest('# title # foo #tag', []);

        // 文中
        runExtractTest('text #tag', []);

        // Unicode
        runExtractTest('#tag1　#tag2', ['tag1', 'tag2']);
        runExtractTest('#リリース', ['リリース']);
    });

});
