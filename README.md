# ⚔️ ROUGE - 迷宮の秘宝 (Dungeon of the Amulet)

> ネオ・レトロな3Dクォータービュー × 本格ローグライクWebゲーム  
> スマートフォン（縦持ち）＆ PC（キーボード／ゲームパッド）完全両対応

![ROUGE Banner](https://img.shields.io/badge/Platform-Web%20%7C%20Mobile-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Zero Dependency](https://img.shields.io/badge/Dependencies-Zero-orange?style=for-the-badge)
[![Play Online](https://img.shields.io/badge/🎮%20Play%20Online-GitHub%20Pages-success?style=for-the-badge&logo=github)](https://zabaglione.github.io/rouge-3d/)

### 🔗 公開ページ (Live Demo)
👉 **今すぐブラウザで遊ぶ**: **[https://zabaglione.github.io/rouge-3d/](https://zabaglione.github.io/rouge-3d/)**  
*(PC・スマートフォン縦持ち両対応)*

---

## 🌟 ゲームの特徴

- 🎮 **3Dクォータービュー（アイソメトリック）ビジュアル**:
  - レトロクラシックなローグライクの手触りをそのままに、重厚な金属ダンジョン壁や立体キャラクター、滑らかな移動・攻撃アニメーション、ダイナミックな光彩エフェクトを搭載。
- 💥 **攻撃の手応えを伝える演出**:
  - 命中の瞬間のヒットストップ・画面揺れ・カメラの反動・火花、撃破時に弾けて消える敵、会心の一撃のズームと閃光。
  - 自分の攻撃 → 敵の反撃を1体ずつ順番に見せ、HPバーやログも当たった瞬間に合わせて減る。
  - 足元の土ぼこり、壁にぶつかる音、拾ったアイテムが跳ねる演出、階層移動の暗転と階層名表示。
- 📱 **スマートフォン縦持ち（ポートレート）UI完全最適化**:
  - 片手・両手の親指操作に最適化されたエルゴノミクス配置のバーチャル8方向十字キー／ジョイスティック、SFC風アクションボタン（A/B/X/Y）。
  - スマホ画面でも被らない2段組ステータスHUD＆メッセージログ。
- 🐉 **全24種・オリジナルローグ級の多彩なモンスター生態系**:
  - スライムやバットなどの序盤モンスターから、装備をサビさせるラストモンスター、アイテムやゴールドを盗んで逃走する妖精、最大HPを吸い取るレイス、麻痺睨みのビホルダー、強烈な炎を吐くレッドドラゴンまで、個性豊かな能力を持つモンスターが登場。
  - 盗まれたゴールドやアイテムは、逃げる盗賊系モンスターを撃破することで奪還可能！
- 🗡️ **普遍的・安全なファンタジーアイテム群**:
  - 商標・著作権に配慮した抽象度の高い本格ファンタジー武具・薬・巻物・杖（ショートソード、フランベルジェ、タワーシールド、ヒールポーション、光輝のスクロール等）。
- 🗺️ **SFC風オーバーレイマップ＆右上ミニマップ**:
  - 探索状況が一目でわかる透過マップ。画面を隠さず探索できます。
- 🔊 **外部ファイル不要のWeb Audioシンセサイザー音響**:
  - 攻撃音、ダメージ音、ポーション使用音、フロア移動音などをすべてWeb Audio APIで生成。通信遅延や外部アセット切れの心配なし。

---

## 🕹️ 操作方法

### 💻 PC（キーボード / ゲームパッド）

| アクション | キーボード | ゲームパッド (XInput/DirectInput) |
|---|---|---|
| **移動 / 方向転換** | `矢印キー` / `テンキー (1-9)` / `H J K L Y U B N` | 方向パッド / 左スティック |
| **通常攻撃 / 決定** | `Space` / `Enter` | `Aボタン` (最下部) |
| **ダッシュ（部屋の角まで直進）** | `Shift` + 移動キー | `Bボタン` + 方向 |
| **その場で足踏み（HP回復）** | `.` (ピリオド) / `テンキー 5` | `Bボタン` (単押し) |
| **斜め移動固定** | `R` キー（トグル） | `Xボタン` |
| **向き変更（ターン消費なし）** | `Ctrl` または `C` キー + 方向 | `Yボタン` |
| **アイテム（持物メニュー）** | `I` キー | `START` / `Y` |
| **全体マップ表示切替** | `M` キー | `SELECT` / `BACK` |
| **メッセージ履歴展開** | `L` キー | - |

### 📱 スマートフォン（タッチ操作）

- **左下コントローラー**:
  - **8方向十字キー** または **アナログジョイスティック**（上部の切替ボタンでいつでも変更可能）。
- **右下SFCボタン**:
  - **Aボタン（赤）**: 攻撃 / 決定
  - **Bボタン（黄）**: ダッシュ / 足踏み
  - **Xボタン（青）**: アイテム（持物）
  - **Yボタン（緑）**: 向き変更固定
  - **上部補助ボタン**: `[斜め]`, `[足踏]`, `[地図]`

---

## 🚀 GitHub Pages での公開手順

このリポジトリは、外部ビルドツール（WebpackやVite等）を必要としない完全なバニラHTML5/CSS3/JavaScript（ES Modules）構成となっており、GitHub Pagesにプッシュするだけで即座に公開できます。

1. **GitHubにリポジトリをプッシュ**:
   ```bash
   git add .
   git commit -m "feat: Release Rouge web game"
   git push origin main
   ```
2. **GitHubリポジトリの設定を開く**:
   - リポジトリの **Settings** タブをクリック。
   - 左サイドバーの **Pages** を選択。
3. **Build and deployment 設定**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`（または `master`）、フォルダは `/ (root)` を選択。
   - **Save** をクリック。
4. **公開完了**:
   - 数十秒で **[https://zabaglione.github.io/rouge-3d/](https://zabaglione.github.io/rouge-3d/)** にてゲームが全世界に公開されます！

---

## 📁 ディレクトリ構成

```
.
├── index.html              # ゲームメインエントリーポイント
├── .nojekyll               # GitHub Pages用Jekyll無効化ファイル
├── README.md               # プロジェクト概要ドキュメント
├── css/
│   ├── main.css            # 基本リセット・共通グラスモーダル・セーフエリア
│   ├── hud.css             # 画面上部ステータスHUD・下部メッセージログ
│   ├── controls.css        # 十字キー・ジョイスティック・SFCアクションボタン
│   └── inventory.css       # SFC風アイテムウィンドウ
└── js/
    ├── main.js             # 初期化・ゲームループ
    ├── config.js           # 定数・キーバインド・タイル設定
    ├── engine/
    │   ├── Game.js         # ゲームステート・ターン管理・戦闘ロジック
    │   ├── Input.js        # キーボード・ゲームパッド・バーチャルパッド入力統合
    │   ├── Sound.js        # Web Audio API シンセサイザー音響エンジン
    │   ├── Animation.js    # 攻撃・ヒット・エフェクトアニメーション、画面揺れ・フラッシュ
    │   └── FxClock.js      # 演出の順番再生（敵の反撃を遅らせて見せる）とヒットストップ
    ├── map/
    │   └── DungeonGenerator.js # 部屋・通路・階段・アイテム・モンスター自動生成
    ├── entities/
    │   ├── Entity.js       # 基底エンティティ
    │   ├── Player.js       # プレイヤー（ステータス・満腹度・レベルアップ）
    │   └── Monster.js      # 全24種のモンスター定義・AIルーチン
    ├── items/
    │   ├── Item.js         # アイテムマスタ・ドロップテーブル
    │   ├── Inventory.js    # 持ち物管理（20枠・装備・呪い）
    │   └── ItemEffects.js  # 使用・投擲・装備効果ロジック
    ├── rendering/
    │   └── CanvasRenderer.js # 3Dクォータービュー（アイソメトリック）描画
    └── ui/
        ├── HUD.js          # 上部HUD・メッセージログDOM更新
        ├── InventoryUI.js  # アイテム画面DOM操作
        └── OverlayMap.js   # 全体マップ・ミニマップ描画
```

---

## 📜 ライセンス

MIT License
