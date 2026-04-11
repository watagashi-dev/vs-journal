import { FileMeta } from "../models/FileMeta";
import { sortFiles } from './fileSort';

export interface TagHierarchyNode {
    name: string;
    children: Map<string, TagHierarchyNode>;
    files: FileMeta[];
    contextValue?: string;
}

export class TagHierarchyBuilder {

    build(
        systemTagIndex: Map<string, FileMeta[]>,
        userTagIndex: Map<string, FileMeta[]>,
        virtualTagIndex: Map<string, FileMeta[]>
    ): {
        system: TagHierarchyNode[];
        user: TagHierarchyNode[];
        virtual: TagHierarchyNode[];
    } {

        const buildTree = (tagIndex: Map<string, FileMeta[]>): TagHierarchyNode[] => {
            const nodesMap: Map<string, TagHierarchyNode> = new Map();

            for (const [tagPath, files] of tagIndex.entries()) {
                let currentMap = nodesMap;
                let currentNode: TagHierarchyNode | undefined;

                let parts = tagPath.split('/');

                if (parts.length > 4) {
                    parts = parts.slice(0, 3).concat([parts.slice(3).join('/')]);
                }

                for (const part of parts) {
                    if (!currentMap.has(part)) {
                        currentMap.set(part, {
                            name: part,
                            children: new Map(),
                            files: [],
                            contextValue: 'tag'
                        });
                    }

                    currentNode = currentMap.get(part)!;
                    currentMap = currentNode.children;
                }

                currentNode!.files.push(...files);
            }

            // --- 再帰ソート ---
            const sortNode = (node: TagHierarchyNode) => {

                // children は Map のまま再構築（順序保証）
                const sortedChildren = [...node.children.entries()]
                    .sort(([a], [b]) => a.localeCompare(b));

                node.children = new Map(sortedChildren);

                // ファイル
                node.files = sortFiles(node.files, 'title', 'asc');

                // 再帰
                for (const [, child] of sortedChildren) {
                    sortNode(child);
                }
            };

            const rootEntries = [...nodesMap.entries()]
                .sort(([a], [b]) => a.localeCompare(b));

            const rootNodes = rootEntries.map(([, node]) => node);

            for (const node of rootNodes) {
                sortNode(node);
            }

            return rootNodes;
        };

        return {
            system: buildTree(systemTagIndex),
            user: buildTree(userTagIndex),
            virtual: buildTree(virtualTagIndex)
        };
    }
}
