// sidebar/TagTreeProvider.ts
import * as vscode from 'vscode';

/**
 * データ構造の型定義
 */
interface FileInfo {
    filePath: string;
    title: string;
}

export class TagTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    // コンストラクタで外部からデータを受け取る
    constructor(
        private tags: string[],
        private untaggedFiles: FileInfo[],
        private tagIndex: Map<string, FileInfo[]> // 「どのタグにどのファイルがあるか」の事前計算データ
    ) {}

    // データを一括更新するためのメソッド
    refresh(tags: string[], untaggedFiles: FileInfo[], tagIndex: Map<string, FileInfo[]>) {
        this.tags = tags;
        this.untaggedFiles = untaggedFiles;
        this.tagIndex = tagIndex;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        // --- 1. ルート要素（タグ一覧）を表示 ---
        if (!element) {
            const tagNodes = this.tags
                .sort()
                .map(tag => new TreeItem(tag, vscode.TreeItemCollapsibleState.Collapsed, 'tag'));
            
            if (this.untaggedFiles.length > 0) {
                tagNodes.push(new TreeItem('Untagged', vscode.TreeItemCollapsibleState.Collapsed, 'untagged'));
            }

            return Promise.resolve(tagNodes);
        }

        // --- 2. 子要素（ファイル一覧）を表示 ---
        // 既にデータは Map (tagIndex) にあるので、fs は一切使わない
        let files: FileInfo[] = [];

        if (element.contextValue === 'untagged') {
            files = this.untaggedFiles;
        } else if (element.contextValue === 'tag') {
            files = this.tagIndex.get(element.label as string) || [];
        }

        const fileNodes = files.map(f => {
            const item = new TreeItem(f.title, vscode.TreeItemCollapsibleState.None, 'file');
            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(f.filePath)]
            };
            item.tooltip = f.filePath; // ホバー時にフルパスを表示
            return item;
        });

        return Promise.resolve(fileNodes);
    }
}

export class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue?: string // 'tag' | 'file' | 'untagged'
    ) {
        super(label, collapsibleState);
    }
}