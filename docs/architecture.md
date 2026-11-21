# アーキテクチャ

この文書は現在の実装をコード上で追えるようにまとめたものです。利用者向けの機能説明は [README.ja.md](../README.ja.md)、開発時の変更ルールは [AGENTS.md](../AGENTS.md) を参照してください。

## コンポーネント

| コンポーネント | 主な責務 |
| --- | --- |
| `src/extension.ts` | Extension Hostの起動、コマンドとイベントの登録、ジャーナル走査、各タグ索引の更新、新規ファイルや画像・リンクの操作 |
| `src/services/` | Markdownメタデータ、タグ解析、仮想タグ照合、タグ階層、ソート、永続化状態 |
| `src/sidebar/TagTreeProvider.ts` | 3種のタグ階層をVS Code TreeView項目に変換・表示 |
| `src/preview/previewPanel.ts` | Preview WebViewの生成・状態管理、HTMLの組み立て、WebViewメッセージの受信 |
| `src/preview/previewRenderer.ts` | markdown-it設定とMarkdownトークンからのHTMLレンダリング |
| `src/webview/` | 生成済みHTMLの操作、構文ハイライト、スタイル、CSPテンプレート、言語定義とKaTeXリソース |

## 起動・索引構築

`activate` は `StateService` を初期化し、TreeViewやコマンド、イベントハンドラーを登録します。その後 `performScan` から `refreshAllData` を実行し、走査結果でツリーを構築して保存済みの展開・ソート状態を整理し、ファイル監視を設定します。

`getAllMarkdownFiles` は保存先を再帰走査し、`isMarkdownFilePath` で拡張子が大文字小文字を問わず `.md` のファイルを列挙します。`refreshAllData` はファイル内容・統計情報を読み、`createFileMeta` を通じて `fileMetaMap` とユーザータグ索引を構築します。続いてシステムタグを再構築し、`rebuildVirtualTagIndex` で登録中の仮想タグを照合します。最後に `rebuildTree` が `TagHierarchyBuilder` と `TagTreeProvider.refresh` を呼びます。

## ファイル変更時の更新経路

- 作成イベント: `.md` と判定されたファイルについて `updateSingleFile` を呼び、単一ファイルのメタデータ・ユーザータグ・仮想タグ・システムタグを更新してツリーを再構築します。
- 変更イベント: `.md` 以外は無視します。該当ファイルが開いたテキスト文書として存在する場合はこの監視経路では更新せず、そうでなければ作成時と同様に単一ファイルを更新します。
- 削除イベント: 削除ファイル単独のメタデータを取り除くのではなく、`refreshAllData` で保存先を全件再走査し、その後ツリーを再構築します。`refreshAllData` はメタデータ、ユーザータグ、システムタグ、仮想タグ索引をクリアしますが、登録中の仮想タグ集合そのものはクリアしません。
- ジャーナル保存先設定の変更: 仮想タグ状態とタグ使用履歴をクリアし、保存状態の一部を消去して再走査・監視再設定を行い、現在のプレビューを閉じます。索引や仮想タグ集合の詳細は [data-model.md](data-model.md) を参照してください。
- テキスト文書の保存: ジャーナルファイルなら単一ファイルを更新してツリーを再構築します。プレビュー状態があれば、保存対象のメタデータを置き換えてプレビューも更新します。

ファイル監視の作成・変更イベントと初回走査は、共通の `isMarkdownFilePath` を使って拡張子を判定します。そのため `.md`、`.MD` など、大文字小文字が異なる拡張子も同じように処理されます。

## 保存先とパスキー

`getJournalDir` の設定未指定時の既定値は `os.homedir()/vsJournal` です。相対パスの解決には `getAbsoluteJournalDir` がワークスペースルートを使います。索引のファイルキーは `filePathToKey` による `vscode.Uri.file(filePath).toString()` です。

## 主要な依存関係

```text
extension.ts
  ├─ fileMetaService.ts / tagLogic.ts
  ├─ virtualTagService.ts ── state.ts
  ├─ TagHierarchyBuilder.ts ── TagTreeProvider.ts
  └─ previewPanel.ts ── previewRenderer.ts ── WebView (webview.ts)
```

`state.ts` と `extension.ts` は相互に参照します。WebViewとExtension Host間のメッセージ型は共有モジュールに定義されていません。詳細は [preview.md](preview.md) を参照してください。
