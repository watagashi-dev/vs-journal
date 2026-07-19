import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';
import { CodeBlockTracker, extractTags } from './tagLogic';

export function createFileMeta(
    filePath: string,
    content?: string,
    stats?: fs.Stats
): FileMeta {
    let ctime = 0;
    let mtime = 0;
    let size = 0;

    // --- Ensure content ---
    if (!content) {
        content = fs.readFileSync(filePath, 'utf-8');
    }

    // --- Ensure stats ---
    if (!stats) {
        try {
            stats = fs.statSync(filePath);
        } catch {
            // Fallback for test environment (no real file)
            stats = {
                ctimeMs: 0,
                mtimeMs: 0,
                size: content.length
            } as fs.Stats;
        }
    }

    if (stats) {
        ctime = stats.ctimeMs;
        mtime = stats.mtimeMs;
        size = stats.size;
    }

    // --- 1. File name ---
    const fileName = path.basename(filePath);

    // --- 2. Split lines ---
    const lines = content.split(/\r?\n/);

    // --- 3. Extract title ---
    let title = fileName;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            continue;
        }

        if (trimmed.startsWith('# ')) {
            title = trimmed.substring(2).trim();
        }

        break;
    }

    // --- 4. Extract tags ---
    const tags: string[] = [];
    const tracker = new CodeBlockTracker();

    for (const line of lines) {
        if (!tracker.processLine(line)) {
            continue;
        }

        const extracted = extractTags(line.trim());

        if (extracted.length > 0) {
            tags.push(...extracted);
        }
    }
    const uniqueTags = [...new Set(tags)];

    // --- 5. Return ---
    return {
        filePath,
        fileName,
        title,
        tags: uniqueTags,
        ctime,
        mtime,
        size
    };
}

export async function deleteNote(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.delete(uri, { useTrash: true });
        return true;
    } catch (err) {
        const deleteLabel = vscode.l10n.t('Delete Permanently');
        const result = await vscode.window.showWarningMessage(
            vscode.l10n.t('Failed to move file to trash. Delete permanently?'),
            { modal: true },
            deleteLabel
        );

        if (result !== deleteLabel) {
            return false;
        }

        await vscode.workspace.fs.delete(uri, { useTrash: false });
        return true;
    }
}