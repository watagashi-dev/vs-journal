import * as vscode from 'vscode';
import { TagHierarchyNode } from '../services/TagHierarchyBuilder';
import { getJournalRelativePath } from '../extension';
import { FileMeta } from '../models/FileMeta';

class VSTagItem extends vscode.TreeItem {
    constructor(
        public readonly node: TagHierarchyNode | null,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
    }
}

function createSpacerItem(): VSTagItem {
    const spacer = new VSTagItem(
        null,
        '---------------', // Spacer label
        vscode.TreeItemCollapsibleState.None,
        'spacer'
    );
    spacer.command = undefined; // Not clickable
    spacer.iconPath = undefined; // No icon
    spacer.tooltip = '';
    return spacer;
}

export class TagTreeProvider implements vscode.TreeDataProvider<VSTagItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private systemNodes: TagHierarchyNode[] = [];
    private userNodes: TagHierarchyNode[] = [];
    private virtualNodes: TagHierarchyNode[] = [];
    private isScanning = false;

    public createSpinnerItem(): VSTagItem {
        const spinner = new VSTagItem(
            null,
            vscode.l10n.t('Scanning tags...'),
            vscode.TreeItemCollapsibleState.None,
            'spinner'
        );
        spinner.iconPath = new vscode.ThemeIcon('sync~spin'); // Spinning icon
        spinner.command = undefined; // Not clickable
        spinner.tooltip = '';
        return spinner;
    }

    setScanning(scanning: boolean) {
        this.isScanning = scanning;
        this._onDidChangeTreeData.fire();
    }

    refresh(
        systemNodes: TagHierarchyNode[],
        userNodes: TagHierarchyNode[],
        virtualNodes: TagHierarchyNode[]
    ) {
        this.systemNodes = systemNodes;
        this.userNodes = userNodes;
        this.virtualNodes = virtualNodes;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: VSTagItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: VSTagItem): Thenable<VSTagItem[]> {
        if (this.isScanning) {
            return Promise.resolve([this.createSpinnerItem()]);
        }
        // ===== ROOT =====
        if (!element) {
            const result: VSTagItem[] = [];

            const pushSection = (label: string, nodes: TagHierarchyNode[]) => {

                // Section header (not clickable, no collapse chevron)
                const item = new VSTagItem(
                    null,
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'section'
                );

                // Use icon for visual emphasis
                item.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.blue'));
                result.push(item);

                // List tags beneath as siblings
                for (const node of nodes) {
                    result.push(this.createTagItem(node));
                }
            };

            pushSection(vscode.l10n.t('System Tags'), this.systemNodes);
            // result.push(createSpacerItem());
            pushSection(vscode.l10n.t('User Tags'), this.userNodes);
            // result.push(createSpacerItem());
            pushSection(vscode.l10n.t('Virtual Tags'), this.virtualNodes);

            return Promise.resolve(result);
        }

        // ===== SECTION (No children) =====
        if (!element.node) {
            return Promise.resolve([]);
        }

        // ===== TAG NODE =====
        const node = element.node;
        const children: VSTagItem[] = [];

        // Child tags
        for (const child of node.children.values()) {
            children.push(this.createTagItem(child));
        }

        // Files
        for (const file of node.files) {
            const item = new VSTagItem(
                null,
                file.title,
                vscode.TreeItemCollapsibleState.None,
                'file'
            );

            item.command = {
                command: 'vs-journal.previewEntry',
                title: 'Preview Entry',
                arguments: [file.filePath]
            };

            item.tooltip = getJournalRelativePath(file.filePath);

            children.push(item);
        }

        return Promise.resolve(children);
    }

    private createTagItem(node: TagHierarchyNode): VSTagItem {
        return new VSTagItem(
            node,
            vscode.l10n.t(node.name),
            vscode.TreeItemCollapsibleState.Collapsed,
            'tag'
        );
    }
}
