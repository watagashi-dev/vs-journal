import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as workspaceUtils from '../utils/workspace';
import { FileMeta } from '../models/FileMeta';
import {
	VSJournalConfig,
	generateFolderPath, generateFullPath,
	getAbsoluteJournalDir,
	getUserTagsFromMeta,
	isJournalFile,
	isMarkdownFilePath
} from '../extension';


suite('VS Journal Logic Tests', () => {

	test('getAbsoluteJournalDir returns absolute path as is', () => {
		const abs = '/tmp/test';
		assert.strictEqual(getAbsoluteJournalDir(abs), abs);
	});

	test('getAbsoluteJournalDir converts relative path with workspace root', () => {
		const workspaceRoot = '/workspace/root';
		const rel = 'journal';

		// Temporarily replace workspace.getWorkspaceRoot
		const originalGetWorkspaceRoot = workspaceUtils.getWorkspaceRoot;
		(workspaceUtils as any).getWorkspaceRoot = () => workspaceRoot;

		const result = getAbsoluteJournalDir(rel);
		assert.strictEqual(result, path.join(workspaceRoot, rel));

		// Restore the original function
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

	test('isMarkdownFilePath accepts .md extensions regardless of case', () => {
		assert.strictEqual(isMarkdownFilePath('/journal/note.md'), true);
		assert.strictEqual(isMarkdownFilePath('/journal/note.MD'), true);
		assert.strictEqual(isMarkdownFilePath('/journal/note.Md'), true);
		assert.strictEqual(isMarkdownFilePath('/journal/note.mD'), true);
	});

	test('isMarkdownFilePath rejects other extensions', () => {
		assert.strictEqual(isMarkdownFilePath('/journal/note.markdown'), false);
		assert.strictEqual(isMarkdownFilePath('/journal/note.md.txt'), false);
	});

	test('getUserTagsFromMeta merges file and heading tags without duplicates', () => {
		const meta: FileMeta = {
			filePath: '/journal/note.md',
			fileName: 'note.md',
			title: 'Note',
			tags: ['shared', 'file-only'],
			headings: [
				{
					text: 'Heading',
					rawText: 'Heading #shared #heading-only',
					level: 1,
					line: 0,
					tags: ['shared', 'heading-only']
				}
			],
			ctime: 0,
			mtime: 0,
			size: 0
		};

		assert.deepStrictEqual(
			getUserTagsFromMeta(meta),
			new Set(['shared', 'file-only', 'heading-only'])
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
