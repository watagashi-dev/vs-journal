import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as workspaceUtils from '../utils/workspace';
import { FileMeta } from '../models/FileMeta';
import {
	VSJournalConfig,
	generateFolderPath, generateFullPath,
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

suite('Path Generation Tests', () => {

	const baseDir = '/workspace/root/journal';
	const date = new Date(2026, 4, 5, 3, 7); // 2026-05-05 03:07

	function createConfig(folderStructure: VSJournalConfig['folderStructure']): VSJournalConfig {
		return {
			fileNameStyle: 'datetime-minute',
			folderStructure
		};
	}

	test('generateFolderPath: flat returns baseDir', () => {
		const result = generateFolderPath(date, createConfig('flat'), baseDir);
		assert.strictEqual(result, baseDir);
	});

	test('generateFolderPath: yyyy creates year folder', () => {
		const result = generateFolderPath(date, createConfig('yyyy'), baseDir);
		assert.strictEqual(result, path.join(baseDir, '2026'));
	});

	test('generateFolderPath: yyyy-mm creates year/month folder', () => {
		const result = generateFolderPath(date, createConfig('yyyy-mm'), baseDir);
		assert.strictEqual(result, path.join(baseDir, '2026', '05'));
	});

	test('generateFolderPath: yyyy-mm-dd creates full date folder', () => {
		const result = generateFolderPath(date, createConfig('yyyy-mm-dd'), baseDir);
		assert.strictEqual(result, path.join(baseDir, '2026', '05', '05'));
	});

	test('generateFullPath: includes folder and file name', () => {
		const config: VSJournalConfig = {
			fileNameStyle: 'datetime-minute',
			folderStructure: 'yyyy-mm-dd'
		};

		const fullPath = generateFullPath(date, config);

		assert.ok(fullPath.includes(path.join('2026', '05', '05')));
		assert.ok(fullPath.endsWith('.md'));
	});

});