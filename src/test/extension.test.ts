import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as workspaceUtils from '../utils/workspace';
import { FileMeta } from '../models/FileMeta';
import {
	getAbsoluteJournalDir,
	isJournalFile
} from '../extension';

suite('VS Journal Logic Tests', () => {

	test('getAbsoluteJournalDir returns absolute path as is', () => {
		const abs = '/tmp/test';
		assert.strictEqual(getAbsoluteJournalDir(abs), abs);
	});

	test('getAbsoluteJournalDir converts relative path with workspace root', () => {
		const workspaceRoot = '/workspace/root';
		const rel = 'journal';

		// workspace.getWorkspaceRoot を一時的に置き換え
		const originalGetWorkspaceRoot = workspaceUtils.getWorkspaceRoot;
		(workspaceUtils as any).getWorkspaceRoot = () => workspaceRoot;

		const result = getAbsoluteJournalDir(rel);
		assert.strictEqual(result, path.join(workspaceRoot, rel));

		// 復元
		(workspaceUtils as any).getWorkspaceRoot = originalGetWorkspaceRoot;
	});

	test('isJournalFile returns true for file inside journal', () => {
		const document = {
			uri: { fsPath: '/workspace/root/journal/note.md' }
		} as vscode.TextDocument;

		assert.strictEqual(
			isJournalFile(document, '/workspace/root/journal'),
			true
		);
	});

	test('isJournalFile returns false for file outside journal', () => {
		const document = {
			uri: { fsPath: '/workspace/root/other/note.md' }
		} as vscode.TextDocument;

		assert.strictEqual(
			isJournalFile(document, '/workspace/root/journal'),
			false
		);
	});

});
