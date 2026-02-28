// src/sidebar/TagTreeProvider.ts
import * as vscode from 'vscode';

export interface FileInfo {
    filePath: string;
    title: string;
}

export class TagTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private isScanning: boolean = false;

    constructor(
        private tags: string[],
        private untaggedFiles: FileInfo[],
        private tagIndex: Map<string, FileInfo[]>
    ) {}

    /**
     * データ更新
     */
    refresh(tags?: string[], untaggedFiles?: FileInfo[], tagIndex?: Map<string, FileInfo[]>, scanning?: boolean) {
        if (tags) {
            this.tags = tags;
        }
        if (untaggedFiles) {
            this.untaggedFiles = untaggedFiles;
        }
        if (tagIndex) {
            this.tagIndex = tagIndex;
        }
        if (scanning !== undefined) {
            this.isScanning = scanning;
        }

        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        // ルート要素
        if (!element) {
            if (this.isScanning) {
                const spinner = new TreeItem('Scanning...', vscode.TreeItemCollapsibleState.None);
                spinner.iconPath = new vscode.ThemeIcon('sync~spin'); // 標準回転アイコン
                return Promise.resolve([spinner]);
            }

            const tagNodes = this.tags
                .sort()
                .map(tag => {
                    const item = new TreeItem(
                        tag,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'tag'
                    );
                    return item;
                }); 

            if (this.untaggedFiles.length > 0) {
                tagNodes.push(new TreeItem('Untagged', vscode.TreeItemCollapsibleState.Collapsed, 'untagged'));
            }

            if (tagNodes.length === 0) {
                const emptyNode = new TreeItem('No entries', vscode.TreeItemCollapsibleState.None);
                emptyNode.iconPath = new vscode.ThemeIcon('info');
                return Promise.resolve([emptyNode]);
            }

            return Promise.resolve(tagNodes);
        }

        // 子要素（ファイル一覧）
        let files: FileInfo[] = [];
        if (element.contextValue === 'untagged') {
            files = this.untaggedFiles;
        } else if (element.contextValue === 'tag') {
            files = this.tagIndex.get(element.label as string) || [];
        }

        const fileNodes = files.map(f => {
            const item = new TreeItem(f.title, vscode.TreeItemCollapsibleState.None, 'file');
            item.command = {
                command: 'vs-journal.previewEntry',
                title: 'Preview Entry',
                arguments: [f.filePath] // ファイルパスを渡す
            };
            item.tooltip = f.filePath;
            return item;
        });

        if (fileNodes.length === 0) {
            const emptyChild = new TreeItem('No files', vscode.TreeItemCollapsibleState.None);
            emptyChild.iconPath = new vscode.ThemeIcon('info');
            return Promise.resolve([emptyChild]);
        }

        return Promise.resolve(fileNodes);
    }
}

export class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue?: string
    ) {
        super(label, collapsibleState);
    }
}
