// TagHierarchyBuilder.ts
import * as vscode from 'vscode';
import { FileInfo } from "../sidebar/TagTreeProvider";

export interface TagHierarchyNode {
    name: string;
    children: Map<string, TagHierarchyNode>;
    files: FileInfo[];
    contextValue?: string;
}

export class TagHierarchyBuilder {
    build(
        tagIndex: Map<string, FileInfo[]>,
        untagged: FileInfo[]
    ): TagHierarchyNode[] {
        const nodesMap: Map<string, TagHierarchyNode> = new Map();

        // タグごとに階層化して追加
        for (const [tagPath, files] of tagIndex.entries()) {
            let currentMap = nodesMap;
            let currentNode: TagHierarchyNode | undefined;
            let parts = tagPath.split('/'); // '/' で階層に分解

            if (parts.length > 4) {
                parts = parts.slice(0, 3).concat([parts.slice(3).join('/')]);
            }

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;

                if (!currentMap.has(part)) {
                    const newNode: TagHierarchyNode = {
                        name: part,
                        children: new Map(),
                        files: [],
                        contextValue: 'tag'
                    };
                    currentMap.set(part, newNode);
                }
                currentNode = currentMap.get(part)!;

                // 次の階層へ
                currentMap = currentNode.children;
            }
            currentNode!.files.push(...files);
        }

        // 未タグファイルは Utagged ノードに
        if (untagged.length > 0) {
            const untaggedNode: TagHierarchyNode = {
                name: vscode.l10n.t("Untagged"),
                children: new Map(),
                files: untagged,
                contextValue: 'untagged'
            };
            nodesMap.set('Untagged', untaggedNode);
        }

        // 配列に変換して返す
        return Array.from(nodesMap.values());
    }
}
