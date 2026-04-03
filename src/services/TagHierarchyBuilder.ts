import * as vscode from 'vscode';
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
        tagIndex: Map<string, FileMeta[]>,
        untagged: FileMeta[]
    ): TagHierarchyNode[] {
        const nodesMap: Map<string, TagHierarchyNode> = new Map();

        // --- タグ階層構築 ---
        for (const [tagPath, files] of tagIndex.entries()) {
            let currentMap = nodesMap;
            let currentNode: TagHierarchyNode | undefined;
            let parts = tagPath.split('/');

            if (parts.length > 4) {
                parts = parts.slice(0, 3).concat([parts.slice(3).join('/')]);
            }

            for (const part of parts) {
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
                currentMap = currentNode.children;
            }

            currentNode!.files.push(...files);
        }

        // --- 各ノードのソート（再帰） ---
        const sortNode = (node: TagHierarchyNode) => {
            // 子タグを名前順でソート
            node.children = new Map(
                [...node.children.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
            );

            // ファイルをソート（ここが今回のポイント）
            node.files = sortFiles(node.files, 'title', 'asc');

            // 再帰
            for (const child of node.children.values()) {
                sortNode(child);
            }
        };

        for (const node of nodesMap.values()) {
            sortNode(node);
        }

        // --- Untagged ---
        let untaggedNode: TagHierarchyNode | undefined;
        if (untagged.length > 0) {
            untaggedNode = {
                name: vscode.l10n.t("Untagged"),
                children: new Map(),
                files: sortFiles(untagged, 'title', 'asc'),
                contextValue: 'untagged'
            };
        }

        // --- ルートノードを配列化しソート ---
        const rootNodes = [...nodesMap.entries()]
            .filter(([key]) => key !== 'Untagged') // Untaggedは除外
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, node]) => node);

        // Untaggedを最後に追加
        if (untaggedNode) {
            rootNodes.push(untaggedNode);
        }

        return rootNodes;
    }
}
