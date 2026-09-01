# Snow / Motion v1.0.0 開発・保守引き継ぎ

## 技術構成

- Vite 8
- Three.js 0.185
- Rapier 0.20
- Web Audio API
- Vanilla JavaScript / CSS
- 静的サイトとしてGitHub Pagesへ配置可能

## 開発環境

Node.js 20.19以降、または22.12以降を使用します。

```bash
npm install
npm run dev
```

検証:

```bash
npm test
npm run build
```

ビルド先は`docs/`です。Viteの`base`は相対指定で、GitHubユーザーページとプロジェクトページの両方を想定しています。

## 主要ファイル

| 場所 | 役割 |
| --- | --- |
| `src/main.js` | メニューとゲームの遷移、通常／ランダム起動 |
| `src/main-menu.js` | 曲選択、外部音源、音量、日英UI |
| `src/game.js` | ゲームループ、HUD、ポーズ、クリア処理 |
| `src/stage.js` | ステージ特性と生成計画 |
| `src/course.js` | コース座標、雪面、壁、遠景山 |
| `src/scenery.js` | 木、岩、トンネル、遠景樹林、空 |
| `src/weather.js` | 雪、風、近距離／遠距離FOG |
| `src/night-lighting.js` | ナイター照明 |
| `src/lead-boarder.js` | 先行スノーボーダー |
| `src/jukebox.js` | 楽曲再生、10分制限 |
| `src/menu-audio.js` | メニュー試聴 |
| `src/volume-settings.js` | マスター音量の保存 |
| `src/external-track.js` | 外部音源、タグ、SRT読み込み |
| `music_data/` | 内蔵音源、SRT、メニュー画像 |
| `textures/` | 雪、木、岩、トンネル素材 |
| `scripts/` | Node.jsスモークテスト |

## ステージとシード

通常モードでは曲の`visualProfile`を固定し、レイアウト用シードだけを毎回生成します。ランダムモードでは演出プロファイルも含めて生成します。URLの`seed`と`mode`は再現調査に利用できます。

開けた区間は`vistas`で管理します。遠景山と遠景樹林は同じ稜線関数を共有し、横長画面で背景端が露出しない幅を確保しています。

## 描画構成

遠景と近景は別シーンです。遠景を描画後に深度をクリアし、実コースを描画します。空、遠景山、遠景樹林、太陽はカメラへ追従する舞台セットです。木はテクスチャアトラスを使ったInstancedMeshです。

テクスチャやシェーダーは滑走前にプリコンパイル・事前描画し、Track 7など負荷の高い組み合わせでの初回停止を抑えています。

## 音声

メニュー試聴、本編音楽、滑走効果音は別経路ですが、保存された共通マスター音量を適用します。ブラウザの自動再生制限により、音声開始にはクリックまたはキー入力が必要です。

外部音源はブラウザ内でのみ扱います。タグ解析には`music-metadata`を使用します。再生限度は10分、終了前3秒でフェードアウトします。

## リリース手順

1. `npm test`
2. `npm run build`
3. `docs/`のハッシュ付き旧アセット削除と新アセット追加を確認
4. `RELEASE_CHECKLIST.md`を確認
5. `npm run package:release`で正式なリポジトリZIPを生成
6. ZIPを空の別フォルダへ展開し、`npm ci`、`npm test`、`npm run build`が成功することを確認
7. ZIP展開時に`snow-motion-v1.0.0/`が1つ作られ、その中にソース、lockfile、使用中アセット、全ドキュメント、`docs/`があり、未使用素材がないことを確認
8. 展開したリポジトリ一式をGitHubへアップロード
9. Pagesを`main`ブランチの`/docs`へ設定
10. 公開URLで音楽、テクスチャ、外部音源選択を最終確認

## 既知の制限

- PCキーボード操作を前提とし、タッチ専用操作は未実装です。
- 外部音源の再生形式はブラウザとOSのコーデック対応に依存します。
- 外部SRTは音源と同時に選択した同一ベース名のファイルだけを読み込みます。
- 日本語書体はシステムの明朝体へフォールバックし、Noto Serif JPは同梱していません。
- GitHub Pagesでは大きな音源・テクスチャを初回にダウンロードします。
