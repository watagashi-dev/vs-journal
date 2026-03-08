import * as vscode from 'vscode';

/**
 * ファイル名用の日付文字列
 * 例: 2026-03-08-21-30
 */
export function formatFileNameDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

/**
 * 新規ファイル本文に挿入する日付文字列
 * 言語に応じて「年・月・日」や「MM/DD/YYYY」に変換
 */
export function formatDateString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());

    console.log(vscode.l10n.t('date {1}/{2}/{0}', year, month, day));
    // フォールバックは英語形
    return vscode.l10n.t('date {1}/{2}/{0}', year, month, day);
}

/**
 * 新規ファイル本文に挿入する時刻文字列
 * 例: "21:30"
 */
export function formatTimeString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());

    return vscode.l10n.t('time {0}:{1}', hour, minute);
}