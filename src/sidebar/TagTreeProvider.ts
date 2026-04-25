import * as vscode from 'vscode';
import { TagHierarchyNode } from '../services/TagHierarchyBuilder';
import { getJournalRelativePath } from '../extension';
import { FileMeta } from '../models/FileMeta';

type TagSection = {
    key: 'system' | 'user' | 'virtual';
    getNodes: (provider: TagTreeProvider) => TagHierarchyNode[];
    label: string;
    needCount: boolean;
    needTranslate: boolean;
};

const TAG_SECTIONS: TagSection[] = [
    {
        key: 'system',
        label: vscode.l10n.t('System Tags'),
        getNodes: (p) => p.getSystemNodes(),
        needCount: true,
        needTranslate: true,
    },
    {
        key: 'user',
        label: vscode.l10n.t('User Tags'),
        getNodes: (p) => p.getUserNodes(),
        needCount: false,
        needTranslate: false,
    },
    {
        key: 'virtual',
        label: vscode.l10n.t('Virtual Tags'),
        getNodes: (p) => p.getVirtualNodes(),
        needCount: true,
        needTranslate: false,
    },
];

function formatTagLabel(
    node: TagHierarchyNode,
    section: TagSection
): string {
    const base = section.needTranslate ? vscode.l10n.t(node.name) : node.name;

    if (!section.needCount) {
        return base;
    }

    const count = node.files.length;
    return `${base}(${count})`;
}

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
    // Node type for logic
    public type?: 'file' | 'tag' | 'section' | 'spacer' | 'spinner';

    // File path (only for file nodes)
    public path?: string;

    // File meta (only for file nodes)
    public file?: FileMeta;
}

function createSpacerItem(): VSTagItem {
    const spacer = new VSTagItem(
        null,
        '---------------', // Spacer label
        vscode.TreeItemCollapsibleState.None,
        'spacer'
    );
    spacer.type = 'spacer';
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

    public getSystemNodes(): TagHierarchyNode[] {
        return this.systemNodes;
    }

    public getUserNodes(): TagHierarchyNode[] {
        return this.userNodes;
    }

    public getVirtualNodes(): TagHierarchyNode[] {
        return this.virtualNodes;
    }

    public createSpinnerItem(): VSTagItem {
        const spinner = new VSTagItem(
            null,
            vscode.l10n.t('Scanning tags...'),
            vscode.TreeItemCollapsibleState.None,
            'spinner'
        );
        spinner.type = 'spinner';
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

            const pushSection = (section: TagSection) => {
                // Section header (not clickable, no collapse chevron)
                const item = new VSTagItem(
                    null,
                    section.label,
                    vscode.TreeItemCollapsibleState.None,
                    'section'
                );

                // Use icon for visual emphasis
                item.type = 'section';
                item.tooltip = '';
                item.id = `section:${section.key}`;
                item.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.blue'));
                result.push(item);

                for (const node of section.getNodes(this)) {
                    result.push(this.createTagItem(node, section));
                }
            };

            for (const section of TAG_SECTIONS) {
                pushSection(section);
            }
            // result.push(createSpacerItem());

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

            item.type = 'file';
            item.id = `file:${file.filePath}`;
            item.path = file.filePath;
            item.file = file;

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

    private createTagItem(node: TagHierarchyNode, section?: TagSection): VSTagItem {
        const label = section ? formatTagLabel(node, section) : node.name;
        const item = new VSTagItem(
            node,
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            'tag'
        );

        item.type = 'tag';
        item.id = `${section?.key ?? 'unknown'}:tag:${node.name}`;
        item.tooltip = '';

        item.command = {
            command: 'vs-journal.onTagClick',
            title: 'Open Tag',
            arguments: [node]
        };

        return item;
    }
}
