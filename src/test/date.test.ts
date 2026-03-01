import * as assert from 'assert';
import { formatDate } from '../utils/date';

suite('formatDate Tests', () => {

    test('formats date correctly with single-digit month, day, hour, minute', () => {
        const date = new Date(2026, 0, 5, 3, 7); // 2026-01-05 03:07
        const formatted = formatDate(date);
        assert.strictEqual(formatted, '2026-01-05-03-07');
    });

    test('formats date correctly with double-digit month, day, hour, minute', () => {
        const date = new Date(2026, 11, 15, 14, 59); // 2026-12-15 14:59
        const formatted = formatDate(date);
        assert.strictEqual(formatted, '2026-12-15-14-59');
    });

});
