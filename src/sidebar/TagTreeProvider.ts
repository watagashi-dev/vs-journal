// sidebar/TagTreeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getWorkspaceRoot } from '../utils/workspace';

export class TagTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private tags: string[];
    private untaggedFiles: { filePath: string, title: string }[];

    constructor(
        tags: string[],
        untaggedFiles: { filePath: string; title: string }[],
        private journalDir: string = 'journal' // デフォルト
    ) {
        this.tags = tags;
        this.untaggedFiles = untaggedFiles;
    }

    refresh(
        tags: string[],
        untaggedFiles?: { filePath: string; title: string }[]
    ) {
        this.tags = tags;
        if (untaggedFiles) this.untaggedFiles = untaggedFiles;
        this._onDidChangeTreeData.fire();
    }

    setJournalDir(dir: string) {
        this.journalDir = dir;

        // 新しいディレクトリをスキャンしてタグを再収集
        const root = getWorkspaceRoot();
        if (!root) return;

        const fullDir = path.join(root, dir);
        if (!fs.existsSync(fullDir)) return;

        const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));
        const newTags = new Set<string>();
        const newUntagged: { filePath: string; title: string }[] = [];

        files.forEach(f => {
            const fullPath = path.join(fullDir, f);
            let content: string;
            try {
                content = fs.readFileSync(fullPath, 'utf8');
            } catch {
                return;
            }

            // タグ抽出
            const lines = content.split(/\r?\n/);
            let fileTags: string[] = [];
            lines.forEach(line => {
                line = line.trim();
                if (line.startsWith('# ') || !line.startsWith('#')) return; // 見出しや通常行は除外
                const tagsInLine = line.split(/\s+/).map(t => t.slice(1));
                fileTags.push(...tagsInLine);
            });

            if (fileTags.length === 0) {
                // タグなしは untagged に
                const firstH1 = lines.find(l => l.startsWith('# '))?.replace(/^# /, '') || f;
                newUntagged.push({ filePath: fullPath, title: firstH1 });
            } else {
                fileTags.forEach(t => newTags.add(t));
            }
        });

        this.tags = Array.from(newTags);
        this.untaggedFiles = newUntagged;

        // 最後にツリーを更新
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            // ルート: 各タグ + Untagged
            const tagNodes = this.tags
                .sort()
                .map(tag => new TreeItem(tag, vscode.TreeItemCollapsibleState.Collapsed));
            
            if (this.untaggedFiles.length > 0) {
                tagNodes.push(new TreeItem('Untagged', vscode.TreeItemCollapsibleState.Collapsed));
            }

            return Promise.resolve(tagNodes);
        } 
        // 子要素: タグノードなら該当ファイルを表示
        const root = getWorkspaceRoot();
        if (!root) return Promise.resolve([]);

        if (element.label === 'Untagged') {
            const fileNodes = this.untaggedFiles.map(f => {
                const item = new TreeItem(
                    f.title,
                    vscode.TreeItemCollapsibleState.None
                );

                item.command = {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(f.filePath)]
                };

                return item;
            });

            return Promise.resolve(fileNodes);
        }
        // タグごとのファイルを収集
        const dir = path.join(root, this.journalDir); // MVP: デフォルトのディレクトリ
        if (!fs.existsSync(dir)) return Promise.resolve([]);
        
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.md'))
            .filter(f => {
                const content = fs.readFileSync(path.join(dir, f), 'utf8');
                // ファイルにこのタグが含まれるか
                return content.split(/\r?\n/).some(line => {
                    line = line.trim();
                    if (!line.startsWith('#')) return false;
                    if (line.startsWith('# ')) return false; // 見出しは除外
                    const tags = line.split(/\s+/).map(t => t.slice(1));
                    return tags.includes(element.label);
                });
            });

        const fileNodes = files.map(f => {
            const filePath = path.join(dir, f);

            const content = fs.readFileSync(filePath, 'utf8');
            const firstLine = content.split(/\r?\n/).find(l => l.startsWith('# '));
            const title = firstLine ? firstLine.replace(/^# /, '').trim() : f;

            const item = new TreeItem(
                title,
                vscode.TreeItemCollapsibleState.None
            );

            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)]
            };

            return item;
        });

        return Promise.resolve(fileNodes);
    }
}

export class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
