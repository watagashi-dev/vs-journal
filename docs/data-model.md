# データモデルと状態

この文書はソース内のデータ構造と更新経路を説明します。利用者向けの保存場所・設定一覧は [README.ja.md](../README.ja.md)、開発上のデータ保護ルールは [AGENTS.md](../AGENTS.md) を参照してください。

## Markdownから作るメタデータ

型定義は `src/models/FileMeta.ts` にあります。

- `FileMeta`: `filePath`、`fileName`、`title`、重複を除いた `tags`、`headings`、作成時刻 `ctime`、更新時刻 `mtime`、サイズ `size`。
- `HeadingMeta`: 表示用 `text`、元の見出し `rawText`、見出しレベル、0始まりの行番号 `line`、見出しから抽出したタグ。
- `VirtualTagFile`: 1つのファイルの `FileMeta` と、仮想タグに一致した行番号配列 `matchedLines`。
- `VirtualTagSession`: プレビュー対象の `keyword`、照合時の `caseSensitive`、対象 `VirtualTagFile[]`。

`createFileMeta` は最初の空でない行を調べます。その行が `# ` で始まる場合は後続文字列をタイトルにし、それ以外ならファイル名をタイトルにします。タグと見出しは `CodeBlockTracker` を使ってフェンスコードブロックを除外して抽出します。統計値はファイルシステムの値を使い、テスト用のフォールバックもあります。

## メモリ上の索引

`src/extension.ts` と `src/state.ts` が実行中の索引・状態を保持します。

| 構造 | キー・値 | 用途 |
| --- | --- | --- |
| `fileMetaMap` | URI文字列キー → `FileMeta` | 走査済みファイルのメタデータ |
| `userTagIndexMap` | タグ文字列 → `FileMeta[]` | ファイルタグおよび見出しタグから作るユーザー分類 |
| `systemTagIndexMap` | システムタグID → `FileMeta[]` | 日付・タグ有無による分類 |
| `virtualTagSet` | 仮想タグ文字列の集合 | 現在登録されている仮想タグ名 |
| `virtualTagIndexMap` | 仮想タグ → URI文字列キー → `VirtualTagFile` | 一致ファイルと照合行の索引 |
| `cursorLineMap` | URI文字列キー → 行番号 | 開いている文書のカーソル同期用一時状態 |

`filePathToKey` はファイルパスを `vscode.Uri.file(...).toString()` に変換します。索引上のファイル識別にパス文字列の独自正規化は使いません。

## VirtualTagFileと照合行

`indexVirtualTags` は各ファイルの内容を行に分け、登録された各仮想タグを行ごとに文字列検索します。一致があったファイルについて `VirtualTagFile` を作り、URI文字列キーで `virtualTagIndexMap` に保存します。`matchedLines` は0始まりの行番号です。同じ行内でキーワードが複数回見つかっても、その行番号は検索ループにより複数回入る場合があります。

`rebuildVirtualTagIndex` は索引マップ全体をクリアしてから、現在の `fileMetaMap` にある全ファイルを読み直して再登録します。単一ファイル更新の `updateSingleFile` は対象ファイルの旧メタデータをユーザー索引から除き、再読込後にメタデータとユーザー索引を追加します。仮想タグ索引は `removeVirtualTagsForFile` でそのファイルの旧項目を取り除き、新しい内容で `indexVirtualTags` を呼びます。

ファイル削除時はExtension Hostのファイル監視イベントから全件再走査されます（処理順は [architecture.md](architecture.md)）。この経路は仮想タグ索引を作り直しますが、`virtualTagSet` は保持します。ジャーナル保存先の設定変更では `resetVirtualTags` が集合と索引の両方を空にします。現在のコードで仮想タグ集合を永続化・起動時復元する処理は確認できません。

## 永続化状態と一時状態

`StateService` はVS Codeの `context.globalState` を使い、`tagUsage`、`expandedItems`、`sortStates` と `stateVersion` を管理します。非永続化対象のソート状態は `sessionSortStates` に置きます。永続化データの構造・初期化・掃除処理は [StateService.ts](../src/services/StateService.ts) を参照してください。

タグ索引、メタデータ、仮想タグ集合、カーソル行、Preview状態は実行時メモリにあります。Preview状態はパネルをキーとする `previewStateMap` に格納され、パネル破棄時に削除されます。

実装上、`setCursorLine` と `getCursorLine` はURI文字列キーを使いますが、`clearCursorLine` は引数のパス文字列を直接キーにして削除します。ここでは動作の意図を推測せず、現行コードの差として記録します。
