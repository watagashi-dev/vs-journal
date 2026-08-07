import * as vscode from 'vscode';

export class StateService {
    private static readonly TAG_USAGE_KEY = 'tagUsage';
    private static readonly EXPANDED_ITEMS_KEY = 'expandedItems';

    constructor(
        private readonly globalState: vscode.Memento
    ) { }

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
}