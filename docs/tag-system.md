# タグシステム

タグ表示は、由来の異なるSystem Tag、User Tag、Virtual Tagを別々に索引化した後、共通の階層ノードに変換します。利用者向けのタグ記法や使い方は [README.ja.md](../README.ja.md) を参照してください。

## User Tagの抽出

主な実装は `src/services/tagLogic.ts` と `src/services/fileMetaService.ts` です。

- `createFileMeta` はファイルを行単位で読み、`CodeBlockTracker` がフェンスコード内と判断した行をタグ・見出し抽出から除きます。
- `extractTags` は行の種類を判定し、タグ行または見出し行として妥当な構造に限ってタグ範囲を抽出します。インラインコード部分は `normalizeInlineCode` でマスクされます。
- `parseHeading` は見出しのレベル、行番号、元文字列、表示用文字列、タグを `HeadingMeta` にします。妥当な見出しタグは表示用テキストから除かれます。
- `getUserTagsFromMeta` はファイルタグと見出しタグをまとめ、ファイル単位で重複を除いた集合を返します。`addUserTagsFromMeta` は `addUserTagsToIndex` を通じてその集合を `userTagIndexMap` に追加し、既存のタグ配列があれば末尾にファイルを追加します。`removeUserTagsFromMeta` は同じタグ集合を使って索引からファイルを取り除きます。

タグのトークン規則、行構造の詳細は `tagLogic.ts` と `src/test/tagLogic.test.ts` を参照してください。この文書では利用者向けの規則一覧をREADMEから重複転記しません。

## System Tag

定義は `src/extension.ts` の `systemTagDefinitions` にあります。

| ID | 現在の判定 |
| --- | --- |
| `Today` | ファイルの `mtime` が今日の午前0時以上、明日の午前0時未満 |
| `Yesterday` | `mtime` が昨日の午前0時以上、今日の午前0時未満 |
| `Last Week` | `mtime` が今日から7日前の午前0時以上、昨日の午前0時未満 |
| `Untagged` | `FileMeta.tags` が空 |

`rebuildSystemTags` は全 `FileMeta` に各定義を適用します。`rebuildTree` は `vsJournal.systemTags.visibility` で `false` にされた項目を表示用索引から除外して階層を作ります。

## Virtual Tag

仮想タグ名は `vs-journal.addVirtualTag` コマンドで入力され、trim後に `virtualTagSet` に追加されます。`virtualTagService.ts` の `indexVirtualTags` はファイル内容の全行に対してタグ文字列を検索し、照合行を `VirtualTagFile.matchedLines` として `virtualTagIndexMap` に格納します。これは Markdownのタグ構文解析とは独立した部分文字列照合です。大小文字の扱いは `vsJournal.virtualTags.caseSensitive` 設定に従います。

大小文字設定の変更時は、`rebuildVirtualTagIndex` を一度呼び出し、登録中の全仮想タグについて索引を再構築します。再構築関数は一度の呼び出しで全タグを処理するため、呼び出し側でタグごとに繰り返す必要はありません。

TreeView用には `rebuildTree` が `virtualTagSet` の全タグについて索引を参照し、照合ファイルが0件でも空のタグ分類を生成対象に含めます。仮想タグの更新・削除・再走査時の索引ライフサイクルは [data-model.md](data-model.md) を参照してください。

プレビューでは `previewPanel.ts` が仮想タグ索引からファイルごとの `VirtualTagFile` を取得し、`VirtualTagSession` を組み立てます。索引にそのファイルの項目がない場合も、空の `matchedLines` を持つ `VirtualTagFile` がその場で作られます。照合行はWebView内のナビゲーション位置データに変換されます。描画中の文字強調は `previewRenderer.ts` のMarkdownトークン処理と `webview.ts` のDOM処理が担います。詳細は [preview.md](preview.md) を参照してください。

## 階層とTreeView

`TagHierarchyBuilder.build` はSystem / User / Virtualの各索引を別々に階層化します。タグ文字列を `/` で分割して親子ノードを作り、ユーザータグと仮想タグのルート・子は名前順に整列します。パス深度が4段を超える場合は4段目以降を1つの末尾セグメントにまとめます。システムタグのルート順は入力順を維持します。

`TagTreeProvider` は各セクション、タグノード、ファイル、見出しをTreeItemにします。ファイル項目の子には該当ファイルの見出しタグが表示されます。見出しの絞り込みは `headingTagFilter.ts` の `filterHeadingsForTag` を、ファイル項目の子見出し表示とタグノード配下のファイルの展開可否判定で共用します。User Tagでは見出しの `tags` を完全一致で照合し、Virtual Tagでは見出しの `rawText` にタグ文字列が含まれるかを設定の大小文字規則で照合します。System Tagでは見出しを表示しません。
