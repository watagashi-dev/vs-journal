import * as vscode from 'vscode';

export type FileNameStyle =
    | 'datetime-minute'
    | 'datetime-hour'
    | 'date-only'
    | 'compact-datetime';

/**
 * Date string used for filenames.
 * Example: 2026-03-08-21-30
 */
export function formatFileNameDate(
    date: Date,
    style: FileNameStyle
): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    const YYYY = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const DD = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());

    switch (style) {
        case 'datetime-minute':
            return `${YYYY}-${MM}-${DD}-${hh}-${mm}`;
        case 'datetime-hour':
            return `${YYYY}-${MM}-${DD}-${hh}`;
        case 'date-only':
            return `${YYYY}-${MM}-${DD}`;
        case 'compact-datetime':
            return `${YYYY}${MM}${DD}-${hh}${mm}`;
    }
}

/**
 * Date string to be inserted into the body of a new file.
 * Converts to localized formats like "MM/DD/YYYY" depending on the language.
 */
export function formatDateString(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Fallback uses the English format
    return vscode.l10n.t('{month}/{day}/{year}', { year: year, month: month, day: day });
}

/**
 * Time string to be inserted into the body of a new file.
 * Example: "21:30"
 */
export function formatTimeString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hour = date.getHours();
    const minute = pad(date.getMinutes());

    return vscode.l10n.t('{hour}:{minute}', { hour: hour, minute: minute });
}