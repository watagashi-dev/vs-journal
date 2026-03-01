import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
	getAbsoluteJournalDir,
	addToTagIndex,
	addToUntagged,
	isJournalFile
} from '../extension';

suite('VS Journal Logic Tests', () => {

	test('getAbsoluteJournalDir returns absolute path as is', () => {
		const abs = '/tmp/test';
		assert.strictEqual(getAbsoluteJournalDir(abs), abs);
	});

	test('getAbsoluteJournalDir converts relative path with workspace root', () => {
		// ワークスペースルートをモック
		const workspaceRoot = '/workspace/root';
		const rel = 'journal';

		// inject可能な形で getWorkspaceRoot をモック
		const originalGetWorkspaceRoot = require('../utils/workspace').getWorkspaceRoot;
		require('../utils/workspace').getWorkspaceRoot = () => workspaceRoot;

		const result = getAbsoluteJournalDir(rel);
		assert.strictEqual(result, path.join(workspaceRoot, rel));

		// 復元
		require('../utils/workspace').getWorkspaceRoot = originalGetWorkspaceRoot;
	});

	test('addToTagIndex adds file only once', () => {
		const map = new Map<string, any[]>();
		const file = { filePath: '/a.md', title: 'A' };
		addToTagIndex('tag1', file, map);
		addToTagIndex('tag1', file, map);

		assert.strictEqual(map.get('tag1')!.length, 1);
		assert.strictEqual(map.get('tag1')![0].filePath, '/a.md');
	});

	test('addToUntagged adds file only once', () => {
		const list: { filePath: string; title: string }[] = [];
		const file = { filePath: '/b.md', title: 'B' };
		addToUntagged(file, list);
		addToUntagged(file, list);

		assert.strictEqual(list.length, 1);
		assert.strictEqual(list[0].filePath, '/b.md');
	});

	test('isJournalFile returns true for file inside journal', () => {
		const document = {
			uri: { fsPath: '/workspace/root/journal/note.md' }
		} as unknown as vscode.TextDocument;

		assert.strictEqual(
			isJournalFile(document, '/workspace/root/journal'),
			true
		);
	});

	test('isJournalFile returns false for file outside journal', () => {
		const document = {
			uri: { fsPath: '/workspace/root/other/note.md' }
		} as unknown as vscode.TextDocument;

		assert.strictEqual(
			isJournalFile(document, '/workspace/root/journal'),
			false
		);
	});

});
