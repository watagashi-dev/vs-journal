import * as assert from 'assert';
import { formatFileNameDate, formatDateString, formatTimeString } from '../utils/date';

suite('formatDate Tests', () => {

    test('formats date correctly with single-digit month, day, hour, minute', () => {
        const date = new Date(2026, 0, 5, 3, 7); // 2026-01-05 03:07
        const formatted = formatFileNameDate(date);
        assert.strictEqual(formatted, '2026-01-05-03-07');
    });

    test('formats date correctly with double-digit month, day, hour, minute', () => {
        const date = new Date(2026, 11, 15, 14, 59); // 2026-12-15 14:59
        const formatted = formatFileNameDate(date);
        assert.strictEqual(formatted, '2026-12-15-14-59');
    });

});

suite('formatDateString / formatTimeString Tests', () => {

    test('formats date string correctly (fallback /英語)', () => {
        const date = new Date(2026, 2, 8); // 2026-03-08
        const formatted = formatDateString(date);
        // フォールバック文字列は英語環境で "{1}/{2}/{0}"
        assert.strictEqual(formatted, '3/8/2026');
    });

    test('formats time string correctly (fallback)', () => {
        const date = new Date(2026, 2, 8, 14, 5); // 14:05
        const formatted = formatTimeString(date);
        assert.strictEqual(formatted, '14:5');
    });

    test('formats single-digit month/day/hour/minute correctly', () => {
        const date = new Date(2026, 0, 5, 3, 7); // 2026-01-05 03:07
        const dateStr = formatDateString(date);
        const timeStr = formatTimeString(date);
        assert.strictEqual(dateStr, '1/5/2026'); // 英語フォールバック
        assert.strictEqual(timeStr, '3:7');
    });

    test('formats double-digit month/day/hour/minute correctly', () => {
        const date = new Date(2026, 11, 15, 14, 59); // 2026-12-15 14:59
        const dateStr = formatDateString(date);
        const timeStr = formatTimeString(date);
        assert.strictEqual(dateStr, '12/15/2026'); // 英語フォールバック
        assert.strictEqual(timeStr, '14:59');
    });

});
