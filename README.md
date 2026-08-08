# Voxel Break Lab

iPhone Safari向けのthree.js製ボクセル破壊アクションゲームです。プレイヤーが三人称視点で地形をパンチし、鉱石・敵・地下ゴールを探索します。通常ステージと、シードから決定論的に生成するランダムステージを同じボクセル破壊基盤で動かします。

## 操作

- 左下の仮想スティック：移動
- 右側のドラッグ：カメラ回転
- PUNCH：正面の地形・敵を攻撃
- JUMP：ジャンプ
- 空中PUNCH：地面叩き。着地時に周囲を破壊
- 全画面：Fullscreen APIまたはSafariのホーム画面追加を利用
- リセット：現在のステージを再生成
- 通常ステージ／ランダムステージ：画面上部のステージ選択
- ランダムステージ：シード、サイズ、難易度、テーマを指定
- WebGL非対応時はURLに `?test=2d` を付けて2D三軸テスト表示を使用

入力中はキャンバスのスクロール、範囲選択、標準の長押し操作を抑制しています。iPhoneでは横画面を推奨します。

## 現在のゲーム機能

- 16×16×16チャンクの立方体ボクセル地形
- Soil / Rock / Ore / Bedrock / Wood / Leaves
- 外面だけをチャンク単位のBufferGeometryへ変換
- 破壊対象のチャンクと境界隣接チャンクだけを再構築
- プレイヤー移動、加速・減速、重力、ジャンプ、接地、段差、落下復帰
- パンチ、空中からの地面叩き、攻撃クールダウン、ノックバック
- 敵の追跡・蛇行移動、接触ダメージ、撃破
- 鉱石爆発、連鎖破壊、コイン、コンボ、スコア
- 深度・破壊数・敵撃破数を満たす地下ゴール
- HP、クリア、ゲームオーバー、リスタート
- 破片・砂煙・ヒットストップ・カメラシェイク・Web Audio SE
- WebGLコンテキスト復帰、画面回転、PWA Service Worker

## ランダムステージ

`ProceduralStageSource` は `WorldGenerator` のPass列を実行します。

1. TerrainPass：Domain Warp付きの複数2Dノイズで高さを生成
2. LayerPass：地層、外周岩盤、安全な開始地点、地下ゴール室
3. CavePass：3Dノイズ洞窟
4. MainRoutePass：開始地点からゴールへ続く保証Carver
5. FeaturePass：木、葉、巨岩、露出鉱石
6. StructurePass：小屋・塔・門と構造物Processor
7. GameplayPlacementPass：敵、報酬、Jigsaw地下ネットワーク
8. ValidationPass：掘削到達可能性の検証と限定的フォールバック補修
9. BiomePass：デバッグ用バイオーム集計

同じシード、サイズ、難易度、テーマ、生成バージョンからは同じボクセル配列を生成します。ワールド生成には `Math.random()` を使用しません。Mediumサイズは選択できますが、iPhone実機の計測なしに性能達成を保証しません。

## アーキテクチャ

- `src/core/VoxelDemo.ts`：three.jsのScene、Renderer、プレイヤー表示、resize、context lifecycle、フレームループ
- `src/core/GameRuntime.ts`：ゲーム実行時のシステム接続、状態更新、ステージ切替、ViewState集約
- `src/player/`：移動、重力、接地、ジャンプ、衝突
- `src/combat/`：パンチ、空中攻撃、地面叩き、命中判定
- `src/destruction/`：ボクセル耐久、球状破壊、鉱石、dirty chunk要求
- `src/input/`：DOMイベントから抽象入力への変換
- `src/camera/`：三人称追従、手動回転、背面カメラ、衝突、シェイク
- `src/enemies/`：敵プール、AI、接触、ダメージ、ノックバック
- `src/items/`：コインプール、出現、取得
- `src/rewards/` と `src/game/`：報酬とGameSessionのauthoritative state
- `src/effects/` と `src/audio/`：再利用式演出プールと音
- `src/world/`：VoxelStorage、VoxelWorld、チャンクメッシュ
- `src/worldgen/`：決定論的乱数、ノイズ、生成Pass、到達検証
- `src/ui/`：GameViewStateとUI契約

詳細なデータフローは [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

## 開発・検証

```bash
npm install
npm run dev
npm run build
npm test
npm run test:worldgen
npm run test:worldgen:stress
npm run lint
```

`npm test` はビルド後に通常ルール、architecture contract、runtime contract、HTML検証を実行します。通常のworldgen smoke testは3シード、任意のstress testは100シードです。iPhone実機のFPS・発熱・メモリはこのリポジトリ内の静的テストだけでは測定できません。

## パフォーマンス方針

- TypedArrayを使用し、1ボクセル1Meshは作らない
- iPhoneのdevicePixelRatioは最大1.5
- チャンク再構築はキューでフレーム分散
- 破片、砂煙、敵、コインはプールを再利用
- ワールド生成データは生成完了後にSnapshotとしてVoxelWorldへ渡す
- 破壊アルゴリズムはVoxelWorldの描画責務から分離

## ライセンスと素材

ゲーム内のコード・形状・配色・音はオリジナル実装です。Minecraft本体、プラグイン、MODのコードや素材は使用していません。
