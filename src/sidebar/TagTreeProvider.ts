// src/sidebar/TagTreeProvider.ts
import * as vscode from 'vscode';
import { TagHierarchyNode } from '../services/TagHierarchyBuilder';

export interface FileInfo {
    filePath: string;
    title: string;
}

export class TagTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> =
        new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    private isScanning: boolean = false;
    private nodes: TagHierarchyNode[] = [];

    constructor(initialNodes: TagHierarchyNode[] = []) {
        this.nodes = initialNodes;
    }

    private nodeToTreeItem(node: TagHierarchyNode): TreeItem {
        const item = new TreeItem(
            node.name,
            node.children.size > 0 || node.files.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            node.contextValue,
            node // node情報を保持
        );

        // ファイルがある場合、最初のファイルだけコマンドに設定
        // if (node.files.length > 0) {
        //     item.command = {
        //         command: 'vs-journal.previewEntry',
        //         title: 'Preview Entry',
        //         arguments: [node.files[0].filePath]
        //     };
        //     item.tooltip = node.files.map(f => f.title).join('\n');
        // }
        item.tooltip = node.files.map(f => f.title).join('\n');

        return item;
    }

    /**
     * データ更新
     */
    refresh(nodes: TagHierarchyNode[], scanning?: boolean) {
        this.nodes = nodes;
        if (scanning !== undefined) {
            this.isScanning = scanning;
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        // スキャン中はスピナー表示
        if (this.isScanning) {
            const spinner = new TreeItem(
                vscode.l10n.t("Scanning tags..."),
                vscode.TreeItemCollapsibleState.None);
            spinner.iconPath = new vscode.ThemeIcon('sync~spin');
            return Promise.resolve([spinner]);
        }

        // ルートレベル
        if (!element) {
            if (this.nodes.length === 0) {
                const emptyNode = new TreeItem('No entries', vscode.TreeItemCollapsibleState.None);
                emptyNode.iconPath = new vscode.ThemeIcon('info');
                return Promise.resolve([emptyNode]);
            }
            return Promise.resolve(this.nodes.map(n => this.nodeToTreeItem(n)));
        }

        // 子ノード
        const node = element.node!;
        const children: TreeItem[] = [];

        // タグの子ノードを TreeItem に変換
        for (const child of node.children.values()) {
            children.push(this.nodeToTreeItem(child));
        }

        // ファイルノード
        for (const file of node.files) {
            const item = new TreeItem(file.title, vscode.TreeItemCollapsibleState.None, 'file');
            item.command = {
                command: 'vs-journal.previewEntry',
                title: 'Preview Entry',
                arguments: [file.filePath]
            };
            item.tooltip = file.filePath;
            children.push(item);
        }

        if (children.length === 0) {
            const emptyChild = new TreeItem('No files', vscode.TreeItemCollapsibleState.None);
            emptyChild.iconPath = new vscode.ThemeIcon('info');
            children.push(emptyChild);
        }

        return Promise.resolve(children);
    }
}

export class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue?: string,
        public readonly node?: TagHierarchyNode // ←ここに node を保持
    ) {
        super(label, collapsibleState);
    }
}
