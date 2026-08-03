import * as vscode from 'vscode';

export class StateService {
    private static readonly TAG_USAGE_KEY = 'tagUsage';
    private static readonly EXPANDED_TAGS_KEY = 'expandedTags';

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


    getExpandedTags(): string[] {
        return this.globalState.get<string[]>(
            StateService.EXPANDED_TAGS_KEY,
            []
        );
    }

    async updateExpandedTags(
        expandedTags: string[]
    ): Promise<void> {
        await this.globalState.update(
            StateService.EXPANDED_TAGS_KEY,
            expandedTags
        );
    }

    async addExpandedTag(
        tag: string
    ): Promise<void> {
        const expandedTags = this.getExpandedTags();

        if (!expandedTags.includes(tag)) {
            await this.updateExpandedTags([
                ...expandedTags,
                tag
            ]);
        }
    }

    async removeExpandedTag(
        tag: string
    ): Promise<void> {
        await this.updateExpandedTags(
            this.getExpandedTags().filter(
                item => item !== tag
            )
        );
    }

    /**
     * Remove all saved view states.
     * Used when journal root folder changes.
     */
    async clearExpandedTags(): Promise<void> {
        await this.updateExpandedTags([]);
    }

    /**
     * Remove expanded tags that no longer exist.
     */
    async cleanupExpandedTags(
        existingTags: Set<string>
    ): Promise<void> {
        const expandedTags = this.getExpandedTags();

        const filteredTags = expandedTags.filter(
            tag => existingTags.has(tag)
        );

        if (filteredTags.length !== expandedTags.length) {
            await this.updateExpandedTags(filteredTags);
        }
    }
}