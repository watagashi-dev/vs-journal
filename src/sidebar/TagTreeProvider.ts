import * as vscode from 'vscode';
import { TagHierarchyNode } from '../services/TagHierarchyBuilder';
import { getJournalRelativePath } from '../extension';
import { FileMeta } from '../models/FileMeta';
import { PreviewContext } from '../preview/previewPanel';
import { StateService } from '../services/StateService';
import { sortFiles } from '../services/fileSort';

type TagSection = {
    key: 'system' | 'user' | 'virtual';
    getNodes: (provider: TagTreeProvider) => TagHierarchyNode[];
    label: string;
    needCount: boolean;
    needTranslate: boolean;
    highlight?: (tagName: string) => { keyword: string };
    // fall back behavior
    emptyLabel?: string;
    emptyCommand?: string;
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
        emptyLabel: vscode.l10n.t('No tags found'),
    },
    {
        key: 'virtual',
        label: vscode.l10n.t('Virtual Tags'),
        getNodes: (p) => p.getVirtualNodes(),
        needCount: true,
        needTranslate: false,
        emptyLabel: vscode.l10n.t('No virtual tags yet'),
        emptyCommand: 'vs-journal.addVirtualTag',
        highlight: (tagName) => ({ keyword: tagName, className: 'vjs-virtual-tag' }),
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

    public sectionKey?: string;
    public parentTag?: string;
    // Preview context passed to preview layer
    public previewContext?: PreviewContext;
    public highlight?: {
        keyword: string;
    };

    // Unique key used for view state.
    public stateKey?: string;
    // Whether the state should be persisted.
    public isPersistable = true;
    // Default expanded state of this item.
    public defaultExpanded = false;
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
    constructor(
        private readonly stateService: StateService
    ) {
    }
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

    refreshView(): void {
        this._onDidChangeTreeData.fire();
    }

    private getCollapsibleState(
        defaultExpanded: boolean,
        stateKey?: string
    ): vscode.TreeItemCollapsibleState {
        const expanded = stateKey !== undefined &&
            this.stateService.getExpandedItems().includes(stateKey);

        const isExpanded = defaultExpanded
            ? !expanded
            : expanded;

        return isExpanded
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;
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
                const stateKey = `section:${section.key}`;
                const item = new VSTagItem(
                    null,
                    section.label,
                    this.getCollapsibleState(true, stateKey),
                    'section'
                );

                // Use icon for visual emphasis
                item.type = 'section';
                item.sectionKey = section.key;
                item.stateKey = stateKey;
                item.isPersistable = section.key !== 'virtual';
                item.defaultExpanded = true;
                item.tooltip = '';
                item.id = `section:${section.key}`;
                item.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.blue'));
                result.push(item);
            };

            for (const section of TAG_SECTIONS) {
                pushSection(section);
            }
            return Promise.resolve(result);
        }

        // ===== SECTION (No children) =====
        if (!element.node && element.type === 'section') {
            const section = TAG_SECTIONS.find(s => s.key === element.sectionKey)!;
            const nodes = section.getNodes(this);

            if (nodes.length === 0 && section.emptyLabel) {
                const empty = new VSTagItem(
                    null,
                    section.emptyLabel,
                    vscode.TreeItemCollapsibleState.None,
                    'empty'
                );

                empty.type = 'spacer';
                if (section.emptyCommand) {
                    empty.command = {
                        command: section.emptyCommand,
                        title: section.emptyLabel,
                    };
                }

                return Promise.resolve([empty]);
            }

            return Promise.resolve(
                nodes.map(node => this.createTagItem(node, section))
            );
        }
        // ===== TAG NODE =====
        const node = element.node;
        if (!node) {
            return Promise.resolve([]);
        }

        const section = TAG_SECTIONS.find(
            candidate => candidate.key === element.sectionKey
        );

        const children: VSTagItem[] = [];

        // Child tags
        for (const child of node.children.values()) {
            children.push(this.createTagItem(child, section));
        }

        // Files
        const persistable = element.isPersistable;
        const sortState = this.stateService.getSortState(
            element.stateKey!,
            persistable
        );
        const sortedFiles = sortFiles(
            node.files,
            sortState.key,
            sortState.order
        );

        for (const file of sortedFiles) {
            const item = new VSTagItem(
                null,
                file.title,
                vscode.TreeItemCollapsibleState.None,
                'file'
            );

            item.type = 'file';
            item.sectionKey = element.sectionKey;
            item.stateKey = `file:${getJournalRelativePath(file.filePath)}`;
            item.isPersistable = persistable;
            item.defaultExpanded = false;
            item.parentTag = node.name;

            item.id = `${item.sectionKey}:${node.name}:${item.stateKey}`;
            item.path = file.filePath;
            item.file = file;

            // Set preview context once
            item.previewContext = {
                kind: 'file',
            };

            item.highlight = element.highlight;
            item.command = {
                command: 'vs-journal.previewEntry',
                title: 'Preview Entry',
                arguments: [{
                    filePath: file.filePath,
                    context: item.previewContext,
                    highlight: item.highlight
                }]
            };
            item.tooltip = getJournalRelativePath(file.filePath);

            children.push(item);
        }

        return Promise.resolve(children);
    }

    private createTagItem(node: TagHierarchyNode, section?: TagSection): VSTagItem {
        const label = section ? formatTagLabel(node, section) : node.name;
        const context = section
            ? `tag:${section.key}`
            : 'tag';

        const stateKey = `tag:${section?.key ?? 'user'}:${node.path}`;
        const persistable = section?.key !== 'virtual';
        const sortState = this.stateService.getSortState(
            stateKey,
            persistable
        );
        const sortContext = `sort:${sortState.key}:${sortState.order}`;
        const contextValue = node.files.length > 0
            ? `${context}:${sortContext}`
            : context;
        const item = new VSTagItem(
            node,
            label,
            this.getCollapsibleState(false, stateKey),
            contextValue
        );

        item.type = 'tag';
        item.sectionKey = section?.key;
        item.stateKey = stateKey;
        item.isPersistable = persistable;
        item.defaultExpanded = false;

        if (section?.highlight) {
            item.highlight = section.highlight(node.name);
        }

        item.id = `${section?.key ?? 'unknown'}:tag:${node.path}`;
        item.tooltip = '';

        item.command = {
            command: 'vsJournal.previewMultiEntry',
            title: 'Open Tag',
            arguments: [{
                node,
                context: {
                    kind: 'tag',
                    tagType: section?.key ?? 'user',
                    tagName: node.name
                },
                highlight: item.highlight
            }]
        };

        return item;
    }
}
