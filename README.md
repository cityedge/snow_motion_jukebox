# Snow / Motion — White Line, Warm Heart

音楽と同期して雪山を滑る、ブラウザ向け3Dスノーボード・ジュークボックスゲームです。

8曲のオリジナル楽曲ごとに、時間帯、雪、霧、風、照明、先行ボーダーなどの演出が変化します。既定ステージのほか、同じ曲をランダム生成コースで滑るモードと、手元の音源を読み込むミュージックプレイヤーモードを収録しています。

Version 1.0.0

## Play / 遊ぶ

GitHub Pagesを有効にすると、次の形式のURLからブラウザだけで遊べます。

```text
https://<GitHubユーザー名>.github.io/<リポジトリ名>/
```

デスクトップ版のChromeまたはEdgeを推奨します。WebGL 2とWeb Audio APIを利用します。

ダウンロードしたビルドをローカルで確認する場合、`index.html`を直接開くのではなく、展開先を静的HTTPサーバーで配信してください。ES Modules、音源、テクスチャを利用するため、`file://`ではブラウザのセキュリティ制限を受けます。

### 操作

| キー | 操作 |
| --- | --- |
| `A` / `←` | 左へカーブ |
| `D` / `→` | 右へカーブ |
| `S` / `↓` | ブレーキ |
| `P` / `Esc` | ポーズ／再開 |
| `R` | 現在の曲を最初から滑る |
| `N` | 同じモード・曲設定で新しいコースを生成 |
| `V` | スペクトラム表示切り替え |
| `F` | FPS表示切り替え（初期状態は非表示） |
| `Shift` + `D` | ステージ設定のデバッグ表示 |
| `L` | 日本語／英語切り替え |

メニュー、ポーズ画面、クリア画面はカーソルキーとEnter、またはマウスで操作できます。
メインメニューの音量スライダーは、楽曲試聴・ゲーム本編の音楽・滑走効果音に共通して適用され、ブラウザに保存されます。

## ゲームモード

- **最初から滑る** — 1曲目の通常ステージをすぐに開始します。
- **この曲で滑る** — 曲ごとに設計された演出を保ち、コース形状と障害物配置を毎回生成します。
- **ランダムステージで滑る** — 選択した曲を、互いに矛盾しない範囲で演出も含めてランダム生成したステージで再生します。
- **外部の曲をロード** — 手元の音源をランダムステージで再生します。外部音源は10分でフェードアウトしてクリア扱いになります。

外部音源は `AAC`、`AIFF`、`FLAC`、`M4A`、`MP3`、`OGA`、`OGG`、`OPUS`、`WAV`、`WebM` を選択できます。実際の再生可否はブラウザのコーデック対応に依存します。同じベース名の `.srt` を音源と一緒に選択すると字幕も読み込みます。

## GitHub Pagesで公開する

このリポジトリには、公開用にビルド済みの `docs/` が含まれます。

1. リポジトリ一式をGitHubへアップロードします。
2. リポジトリの **Settings → Pages** を開きます。
3. **Build and deployment** の **Source** を **Deploy from a branch** にします。
4. ブランチを `main`、フォルダを `/docs` にして保存します。
5. 数分後、Pages画面に表示される公開URLを開きます。

`docs/` を更新する場合は、ローカルで次を実行してからコミットしてください。

```bash
npm install
npm test
npm run build:pages
```

ViteのアセットURLは相対指定にしてあるため、ユーザーページ直下でもプロジェクトページのサブディレクトリでも動作します。

## ローカル開発

Node.js 20.19以降、または22.12以降を推奨します。

```bash
npm install
npm run dev
```

本番ビルドと全スモークテスト:

```bash
npm test
npm run build
```

主な構成:

```text
src/          ゲーム本体
music_data/   内蔵楽曲、字幕、メニュー画像
textures/     雪面、樹木、岩、トンネル用素材
scripts/      スモークテスト
public/       GitHub Pages向け静的ファイル
docs/         GitHub Pages公開用ビルド
```

## ライセンス

本プロジェクトは [MIT License](LICENSE) で公開します。使用ライブラリとCC0素材については [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

Copyright © 2026 cityedge

## 配布パッケージ内容

- `src/`、`index.html`、`vite.config.js` — ゲームのソースコードとViteのエントリ
- `music_data/`、`textures/` — 実行時に使用する内蔵曲、字幕、画像、テクスチャだけを収録
- `package.json` / `package-lock.json` — 同じ依存関係を復元するための定義
- `docs/index.html` / `docs/assets/` — GitHub Pagesでそのまま公開できるビルド済みゲーム
- `scripts/` — スモークテストとリリースパッケージ生成処理
- `README.md` — 概要、導入、公開方法
- `USER_GUIDE.md` — 操作、各モード、外部音源、トラブル対処
- `CHANGELOG.md` — 変更履歴
- `RELEASE_REVIEW.md` — v1.0.0の公開前確認記録
- `DEVELOPMENT_HANDOVER.md` — 開発・保守引き継ぎ
- `THIRD_PARTY_NOTICES.md` — ライブラリと素材のライセンス情報
- `LICENSE` — MIT License

`npm run package:release`で生成される`dist/snow-motion-v1.0.0.zip`が正式な配布物です。これは「公開ビルドだけ」ではなく、別のワークスペースへ展開して依存関係の復元、テスト、再ビルドができるGitHubリポジトリ一式です。廃止済みBGM、未使用カバーアート、素材配布時のZIP、開発中の一時ファイルは含みません。

ZIPを通常どおり展開すると、`snow-motion-v1.0.0/`フォルダが1つ作られ、その中にリポジトリ一式が収まります。展開先へファイルを直接ばらまく構造ではありません。フォルダ内の`index.html`はVite用のソースエントリです。ビルド済みゲームは`docs/`にあり、GitHubではこのフォルダの中身をリポジトリへアップロードしてPagesを`/docs`へ設定します。

---

## English

Snow / Motion is a browser-based 3D snowboard jukebox game. Eight bundled original tracks drive authored changes in weather, fog, lighting, scenery, and companion-rider behavior. It also supports generated stages and local audio playback with optional matching SRT subtitles.

Use a desktop Chrome or Edge browser. Select **最初から滑る / RIDE FROM THE BEGINNING** to start immediately, or choose a track and stage mode from the menu. See the tables above for controls and GitHub Pages deployment.

Released under the [MIT License](LICENSE).
