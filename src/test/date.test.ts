import * as assert from 'assert';
import { FileNameStyle, formatFileNameDate, formatDateString, formatTimeString } from '../utils/date';

suite('formatFileNameDate Tests', () => {

    test('datetime-minute: formats correctly with single-digit values', () => {
        const date = new Date(2026, 0, 5, 3, 7);
        const formatted = formatFileNameDate(date, 'datetime-minute');
        assert.strictEqual(formatted, '2026-01-05-03-07');
    });

    test('datetime-minute: formats correctly with double-digit values', () => {
        const date = new Date(2026, 11, 15, 14, 59);
        const formatted = formatFileNameDate(date, 'datetime-minute');
        assert.strictEqual(formatted, '2026-12-15-14-59');
    });

    test('datetime-hour: drops minute', () => {
        const date = new Date(2026, 0, 5, 3, 7);
        const formatted = formatFileNameDate(date, 'datetime-hour');
        assert.strictEqual(formatted, '2026-01-05-03');
    });

    test('date-only: drops time', () => {
        const date = new Date(2026, 0, 5, 3, 7);
        const formatted = formatFileNameDate(date, 'date-only');
        assert.strictEqual(formatted, '2026-01-05');
    });

    test('compact-datetime: removes separators in date and time', () => {
        const date = new Date(2026, 0, 5, 3, 7);
        const formatted = formatFileNameDate(date, 'compact-datetime');
        assert.strictEqual(formatted, '20260105-0307');
    });

});

suite('formatDateString / formatTimeString Tests', () => {

    test('formats date string correctly (fallback / English)', () => {
        const date = new Date(2026, 2, 8);
        const formatted = formatDateString(date);
        assert.strictEqual(formatted, '3/8/2026');
    });

    test('formats time string correctly (fallback)', () => {
        const date = new Date(2026, 2, 8, 14, 5);
        const formatted = formatTimeString(date);
        assert.strictEqual(formatted, '14:05');
    });

    test('formats single-digit month/day/hour/minute correctly', () => {
        const date = new Date(2026, 0, 5, 3, 7);
        const dateStr = formatDateString(date);
        const timeStr = formatTimeString(date);
        assert.strictEqual(dateStr, '1/5/2026');
        assert.strictEqual(timeStr, '3:07');
    });

    test('formats double-digit month/day/hour/minute correctly', () => {
        const date = new Date(2026, 11, 15, 14, 59);
        const dateStr = formatDateString(date);
        const timeStr = formatTimeString(date);
        assert.strictEqual(dateStr, '12/15/2026');
        assert.strictEqual(timeStr, '14:59');
    });

});