import * as vscode from 'vscode';
import { SortKey, SortOrder } from './fileSort';

export type SortState = {
    key: SortKey;
    order: SortOrder;
};

export class StateService {
    private static readonly STATE_VERSION_KEY = 'stateVersion';
    private static readonly CURRENT_STATE_VERSION = 0;

    private static readonly TAG_USAGE_KEY = 'tagUsage';
    private static readonly EXPANDED_ITEMS_KEY = 'expandedItems';
    private static readonly SORT_STATES_KEY = 'sortStates';

    private readonly sessionSortStates = new Map<string, SortState>();

    constructor(
        private readonly globalState: vscode.Memento
    ) { }

    /**
     * Initialize persisted state.
     * Reset all StateService data when the persisted state version changes.
     */
    async initialize(): Promise<void> {
        const version = this.globalState.get<number>(
            StateService.STATE_VERSION_KEY,
            0
        );

        if (version === StateService.CURRENT_STATE_VERSION) {
            return;
        }

        await this.resetState();

        await this.globalState.update(
            StateService.STATE_VERSION_KEY,
            StateService.CURRENT_STATE_VERSION
        );
    }

    private async resetState(): Promise<void> {
        this.sessionSortStates.clear();

        await Promise.all([
            this.clearTagUsage(),
            this.clearExpandedItems(),
            this.clearSortStates()
        ]);
    }

    getTagUsage(): Record<string, number> {
        return this.globalState.get<Record<string, number>>(
            StateService.TAG_USAGE_KEY,
            {}
        );
    }

    async updateTagUsage(
        tagUsage: Record<string, number>
    ): Promise<void> {
        await this.globalState.update(
            StateService.TAG_USAGE_KEY,
            tagUsage
        );
    }

    async clearTagUsage(): Promise<void> {
        await this.globalState.update(
            StateService.TAG_USAGE_KEY,
            {}
        );
    }
    getExpandedItems(): string[] {
        return this.globalState.get<string[]>(
            StateService.EXPANDED_ITEMS_KEY,
            []
        );
    }

    async updateExpandedItems(
        expandedItems: string[]
    ): Promise<void> {
        await this.globalState.update(
            StateService.EXPANDED_ITEMS_KEY,
            expandedItems
        );
    }

    async addExpandedItem(
        key: string
    ): Promise<void> {
        const expandedItems = this.getExpandedItems();

        if (!expandedItems.includes(key)) {
            await this.updateExpandedItems([
                ...expandedItems,
                key
            ]);
        }
    }

    async removeExpandedItem(
        key: string
    ): Promise<void> {
        await this.updateExpandedItems(
            this.getExpandedItems().filter(
                item => item !== key
            )
        );
    }

    /**
     * Remove all saved expanded states.
     * Used when journal root folder changes.
     */
    async clearExpandedItems(): Promise<void> {
        await this.updateExpandedItems([]);
    }

    getSortState(
        key: string,
        persistable: boolean
    ): SortState {
        if (!persistable) {
            return this.sessionSortStates.get(key) ?? {
                key: 'title',
                order: 'asc'
            };
        }

        const sortStates = this.globalState.get<Record<string, SortState>>(
            StateService.SORT_STATES_KEY,
            {}
        );

        return sortStates[key] ?? {
            key: 'title',
            order: 'asc'
        };
    }

    async updateSortState(
        key: string,
        sortState: SortState,
        persistable: boolean
    ): Promise<void> {
        if (!persistable) {
            this.sessionSortStates.set(key, sortState);
            return;
        }

        const sortStates = this.globalState.get<Record<string, SortState>>(
            StateService.SORT_STATES_KEY,
            {}
        );

        await this.globalState.update(
            StateService.SORT_STATES_KEY,
            {
                ...sortStates,
                [key]: sortState
            }
        );
    }

    async clearSortStates(): Promise<void> {
        this.sessionSortStates.clear();
        await this.globalState.update(
            StateService.SORT_STATES_KEY,
            {}
        );
    }

    async cleanupSortStates(
        existingTagStateKeys: Set<string>
    ): Promise<void> {
        const sortStates = this.globalState.get<Record<string, SortState>>(
            StateService.SORT_STATES_KEY,
            {}
        );

        const filteredSortStates = Object.fromEntries(
            Object.entries(sortStates).filter(
                ([stateKey]) => existingTagStateKeys.has(stateKey)
            )
        );

        if (
            Object.keys(filteredSortStates).length !==
            Object.keys(sortStates).length
        ) {
            await this.globalState.update(
                StateService.SORT_STATES_KEY,
                filteredSortStates
            );
        }
    }

    /**
     * Remove expanded states that no longer exist.
     */
    async cleanupExpandedItems(
        existingItems: Set<string>
    ): Promise<void> {
        const expandedItems = this.getExpandedItems();

        const filteredItems = expandedItems.filter(
            item => existingItems.has(item)
        );

        if (filteredItems.length !== expandedItems.length) {
            await this.updateExpandedItems(filteredItems);
        }
    }

    private isSectionExpandedItem(stateKey: string): boolean {
        return stateKey.startsWith('section:');
    }

    async cleanupExpandedTagItems(
        existingTagStateKeys: Set<string>
    ): Promise<void> {
        const expandedItems = this.getExpandedItems();

        const filteredItems = expandedItems.filter(item => {
            if (this.isSectionExpandedItem(item)) {
                return true;
            }

            return existingTagStateKeys.has(item);
        });

        if (filteredItems.length !== expandedItems.length) {
            await this.updateExpandedItems(filteredItems);
        }
    }

    logStateForDevelopment(): void {
        const stateVersion = this.globalState.get<number>(
            StateService.STATE_VERSION_KEY,
            0
        );

        const tagUsage = this.globalState.get<Record<string, number>>(
            StateService.TAG_USAGE_KEY,
            {}
        );

        const expandedItems = this.globalState.get<string[]>(
            StateService.EXPANDED_ITEMS_KEY,
            []
        );

        const sortStates = this.globalState.get<Record<string, SortState>>(
            StateService.SORT_STATES_KEY,
            {}
        );

        console.group('[StateService] Persisted State');

        console.log('State Version:', stateVersion);

        console.group('Tag Usage');
        console.table(
            Object.entries(tagUsage).map(([tag, usage]) => ({
                tag,
                usage
            }))
        );
        console.groupEnd();

        console.group('Expanded Items');
        console.table(
            expandedItems.map((item, index) => ({
                index,
                item
            }))
        );
        console.groupEnd();

        console.group('Sort States');
        console.table(
            Object.entries(sortStates).map(([item, state]) => ({
                item,
                key: state.key,
                order: state.order
            }))
        );
        console.groupEnd();

        console.groupEnd();
    }
}