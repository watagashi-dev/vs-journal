import * as vscode from 'vscode';

/**
 * Date string used for filenames.
 * Example: 2026-03-08-21-30
 */
export function formatFileNameDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
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
    return vscode.l10n.t('{month}/{day}/{year}', {year: year, month: month, day: day});
}

/**
 * Time string to be inserted into the body of a new file.
 * Example: "21:30"
 */
export function formatTimeString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hour = date.getHours();
    const minute = pad(date.getMinutes());

    return vscode.l10n.t('{hour}:{minute}', {hour: hour, minute: minute});
}