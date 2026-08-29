# Voxel Break Lab

iPhone Safari向けのthree.js製ボクセル破壊アクションローグライトです。地形・鉱石・敵を連続して壊し、Momentumを維持しながら地下深部へ潜る「BREAK RUN」がゲームの中心です。

## BREAK RUN

1ランは約5分を目標にしています。

1. 地形・敵・鉱石を壊して `MOMENTUM` を上げる
2. 100に到達すると短時間の `BREAK MODE` に突入
3. BREAK MODE中は移動・攻撃速度・破壊範囲・破壊力が大幅上昇
4. RUN XPが閾値へ到達すると3択のBREAK MODを選ぶ
5. 深部へ進むほど `DEPTH TIER / DANGER` が上昇
6. 地形を掘る敵、爆発型、Bruteなどを地形と組み合わせて倒す
7. 終盤の `DEPTH BOSS` を撃破し、地下ゴールへ到達する
8. RUN終了時にCOREを獲得し、LEGACY RANKとして次のランへ一部成長を持ち越す

## 操作

- 左下の仮想スティック：移動
- 右側ドラッグ：カメラ回転
- BREAK：正面の地形・敵を攻撃
- JUMP：ジャンプ
- 空中BREAK：Ground Slam。着地時に周囲を広範囲破壊
- 全画面：Fullscreen APIまたはSafariのホーム画面追加
- 設定：通常/ランダムステージ、シード、サイズ、難易度、テーマ
- WebGL非対応時：`?test=2d` でCanvas 3Dフォールバック

入力中はスクロール、範囲選択、標準の長押し操作を抑制しています。iPhoneでは横画面を推奨します。

## ローグライト強化

RUN中は決定論的な3択から強化を選びます。現在の例：

- `HEAVY HANDS`：パンチ破壊範囲と敵ダメージを強化
- `SHOCKWAVE CORE`：Ground Slamを大型化
- `RUSH DRIVE`：移動速度と加速を強化
- `ORE REACTOR`：鉱石連鎖から得るMomentumを増加
- `COMBO REPAIR`：高コンボ撃破時にHP回復
- `DEEP DIVER`：深部ほど移動・破壊性能が上昇
- `OVERDRIVE`：BREAK MODE延長
- `BREAKER RHYTHM`：攻撃間隔短縮・リーチ増加
- `BLAST LATTICE`：鉱石爆発とノックバックを強化
- `SECOND WIND`：回復とMomentum維持を強化

## 敵とボス

通常の追跡・蛇行敵に加え、地形破壊と直接結びつく敵を実装しています。

- Burrower：壁に阻まれると掘って追跡
- Bomber：高速接近し、周囲の地形にも爆発作用
- Brute：高耐久・高接触ダメージ・壁破壊
- Depth Boss：大型、高HP、地形を壊しながら追跡
- Depth Reinforcement：敵撃破後もDEPTH TIERに応じて増援され、深部ほど最大同時数・敵種・HP圧が上昇
- Wall Slam：敵を壁へ吹き飛ばすと追加ダメージ＋壁破壊
- Ore Chain：鉱石爆発が周囲の地形と敵を巻き込む

## ランダムステージ / WorldGenerator v3

`ProceduralStageSource` は同じシード・サイズ・難易度・テーマ・生成バージョンから同じステージを生成します。ワールド生成には `Math.random()` を使用しません。

1. TerrainPass：Domain Warp付き2Dノイズ地形
2. LayerPass：地層、外周岩盤、安全な開始地点、地下ゴール室
3. CavePass：3Dノイズ洞窟
4. MainRoutePass：開始地点→ゴールの保証Carver
5. FeaturePass：木、葉、巨岩、露出鉱石
6. StructurePass：小屋・塔・門
7. **BreakSetpiecePass**：破壊そのものが遊びになるセットピースを生成
8. GameplayPlacementPass：敵、報酬、Jigsaw地下ネットワーク
9. ValidationPass：掘削到達可能性を検証・補修
10. BiomePass：バイオーム集計

BreakSetpiecePassは現在、薄い壁の奥へ鉱石を隠す `Ore Vault`、Ground Slamで落下破壊する `Slam Shaft`、連鎖爆発向けの `Chain Gallery` を決定論的に配置します。

## 技術構成

- 16×16×16チャンクの立方体ボクセル地形
- TypedArrayベースのVoxelStorage
- 外面のみをチャンク単位のBufferGeometryへ変換
- 破壊チャンク＋境界隣接チャンクだけ再構築
- `GameRuntime`：ゲーム全体のcomposition root
- `RunDirector`：Momentum、BREAK MODE、RUN XP、3択強化、深度DANGER、ボス、メタ進行
- `PlayerController / PlayerCombat`：移動・ジャンプ・攻撃・Ground Slam
- `EnemyManager`：プール、AI、深度増援、地形連動敵、ボス
- `DestructionSystem`：ボクセル耐久、範囲破壊、鉱石連鎖
- `WorldGenerator`：決定論的Passベース生成
- `GameViewState`：描画/UIとの状態契約
- PWA Service Worker / WebGL context recovery / orientation対応

詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

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

`npm test` はビルド後にゲームルール、architecture/runtime/camera/Canvas preview契約、HTML検証を1ファイルずつ上限時間付きで実行します。worldgen smoke testは3シード、stress testは100シードです。iPhone実機のFPS・発熱・メモリは実機計測が必要です。

## パフォーマンス方針

- 1ボクセル1Meshは禁止
- iPhone devicePixelRatioは最大1.5
- チャンク再構築はフレーム分散
- 破片・砂煙・敵・コインはプールを再利用
- 生成結果はSnapshotとしてVoxelWorldへ渡す
- 破壊アルゴリズムと描画責務を分離
- 鉱石連鎖は1アクション内の処理数を制限し、iPhone上のスパイクを抑える

## 公開・権利について

ゲーム内のコード・形状・配色・音はオリジナル実装です。Minecraft本体、プラグイン、MODのコードや素材は使用していません。

このリポジトリはソース閲覧を目的として公開していますが、現時点ではプロジェクト独自コード・ゲーム素材に対するオープンソースライセンスを付与していません。GitHub上で公開されていること自体は、再配布・商用利用・派生作品作成などの追加権利を許諾するものではありません。依存パッケージにはそれぞれのライセンスが適用されます。

認証トークン、秘密鍵、ローカル環境変数などをコミットしないでください。公開時の機密情報については `SECURITY.md` を参照してください。
