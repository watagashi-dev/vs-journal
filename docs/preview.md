# MarkdownプレビューとWebView

PreviewはExtension Host側のパネル管理・Markdownレンダリングと、WebView側のDOM操作に分かれています。利用者向け機能一覧は [README.ja.md](../README.ja.md)、開発上の変更時注意は [AGENTS.md](../AGENTS.md) を参照してください。

## レンダリング経路

1. `extension.ts` のプレビューコマンドが対象の `FileMeta[]`、`PreviewContext`、必要なら強調条件を `setPreviewState` に渡します。
2. `previewPanel.ts` の `updatePreviewPanel` / `buildHtml` がファイル内容を `vscode.workspace.fs.readFile` で読み込み、各ファイル用のコンテナを作ってMarkdownレンダラーへ渡します。
3. `previewRenderer.ts` の `createMarkdownIt` は markdown-itを構成し、タスクリストとKaTeX数式プラグインを使用します。トークンにソース行属性を付与し、タグ・リンク・画像・HTML・コードフェンスなどのレンダリング規則を登録します。
4. `buildHtml` は `src/webview/template.html` のプレースホルダーに、本文、CSS・スクリプトURI、テーマ、強調ルール、仮想タグナビゲーション用データなどを埋め、`panel.webview.html` に設定します。
5. `webview.ts` はDOM準備後に構文ハイライトや行単位の装飾を行い、クリック・キー・スクロールを扱います。

Previewパネルのファイル一覧・コンテキスト・強調条件・`VirtualTagSession` は `previewStateMap` にパネル単位で保持されます。パネル破棄時に状態が削除されます。拡張側のプレビュー状態更新やファイル保存後の更新は `extension.ts` と `previewPanel.ts` を参照してください。

## Virtual Tagとソース位置

`previewPanel.ts` は `virtualTagIndexMap` からファイル単位の `VirtualTagFile` を参照します。照合行は `{ filePath, line }` の配列としてHTML内のJSONデータに埋め込まれます。ここでの行番号は0始まりです。強調ルールは別途JSON化してテンプレートの `data-rules` 属性に入ります。

`previewRenderer.ts` はMarkdownトークンのソース行範囲を `data-start-line` / `data-end-line` 属性として出力します。WebViewのクリック処理はこれらの属性とファイルコンテナの `data-file` を使ってHostへ行ジャンプ等を依頼します。コードブロックでは行要素を追加し、クリック位置から行・文字位置を推定します。

## メッセージ通信

WebViewからExtension Hostへの送信型 `VsCodeMessage` は `webview.ts` 内で定義されています。Host側の `handleWebviewMessage` は `any` を受け取り、`message.type` ごとに分岐します。共有型定義はありません。

| 方向 | メッセージ | 実装上の処理 |
| --- | --- | --- |
| WebView → Host | `openExternal` | 外部URIを開く |
| WebView → Host | `openLocalLink` | 相対パス解決、内部・外部で開く処理 |
| WebView → Host | `jumpToLine` | 文書を開き、行・文字位置を範囲内に補正して表示 |
| WebView → Host | `setTaskListItem` | Markdownの対象行を検証し、チェックマーカーを編集 |
| WebView → Host | `jumpToFile` | ファイルを開いて表示 |
| WebView → Host | `edit` | 現在の文書をエディターで表示 |
| WebView → Host | `closePreview` | 現在のPreviewパネルを閉じる |
| Host → WebView | `themeChanged` | highlight.jsテーマのリンクを更新 |
| Host → WebView | `scrollToLine` | 対象ファイル・行へスクロール。DOM準備前なら保留 |
| Host → WebView | `setPreviewCount` | WebView内のプレビュー件数状態を更新 |

WebView側には `scrollToTop` を処理する分岐もありますが、現在のソースでHostから送信する箇所は確認できませんでした。

## WebView境界とリソース

`ensurePreviewPanel` はスクリプトを有効にし、ローカルリソースルートを設定します。HTMLテンプレートのCSPは `default-src 'none'` を基本とし、スクリプト・フォント・スタイルをWebViewリソースに制限します。画像にはWebViewリソース、HTTPS、data URLを許可し、スタイルには `'unsafe-inline'` を許可しています。

WebViewはMarkdown本文を含むHTML文字列として生成されます。テンプレートへの値の挿入、HTML属性、JSONデータ、リンクや画像の描画に関するエスケープ処理の詳細は、変更時に `previewPanel.ts`、`previewRenderer.ts`、`template.html` の実装を個別に確認してください。この文書では安全性の評価を追加していません。
