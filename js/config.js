/**
 * ゲーム全体の設定・定数定義
 */
export const CONFIG = {
  // マップサイズ（タイル数）
  MAP_WIDTH: 52,
  MAP_HEIGHT: 36,
  TILE_SIZE: 32, // グリッド計算用
  TILE_W: 48,    // 3Dクォータービュー タイル幅
  TILE_D: 36,    // 3Dクォータービュー タイル奥行き
  WALL_H: 56,    // 3D立体石壁の高さ

  // プレイヤー初期値
  PLAYER_INIT: {
    MAX_HP: 30,
    HP: 30,
    MAX_HUNGER: 100,
    HUNGER: 100,
    HUNGER_RATE: 10, // 何ターンで満腹度が1減るか
    BASE_ATK: 6,
    BASE_DEF: 2,
    LV: 1,
    EXP: 0,
    GOLD: 0,
    VISION_RADIUS: 4, // 通路での視界半径
  },

  // 最大階層
  MAX_FLOOR: 20,

  // アニメーション設定
  MOVE_ANIM_DURATION: 90, // 歩行移動補間時間 (ms)
  DASH_DELAY: 22, // ダッシュ時の1歩インターバル (ms)
  REST_DELAY: 45, // 足踏み時の1ターンインターバル (ms)

  // 方向定義 (SFC準拠 8方向)
  // dx, dy, 角度, 名称, 矢印記号
  DIRECTIONS: [
    { dx: 0, dy: -1, name: 'UP', label: '↑', angle: -Math.PI / 2, isDiagonal: false },
    { dx: 1, dy: -1, name: 'UP_RIGHT', label: '↗', angle: -Math.PI / 4, isDiagonal: true },
    { dx: 1, dy: 0, name: 'RIGHT', label: '→', angle: 0, isDiagonal: false },
    { dx: 1, dy: 1, name: 'DOWN_RIGHT', label: '↘', angle: Math.PI / 4, isDiagonal: true },
    { dx: 0, dy: 1, name: 'DOWN', label: '↓', angle: Math.PI / 2, isDiagonal: false },
    { dx: -1, dy: 1, name: 'DOWN_LEFT', label: '↙', angle: 3 * Math.PI / 4, isDiagonal: true },
    { dx: -1, dy: 0, name: 'LEFT', label: '←', angle: Math.PI, isDiagonal: false },
    { dx: -1, dy: -1, name: 'UP_LEFT', label: '↖', angle: -3 * Math.PI / 4, isDiagonal: true },
  ],

  // タイル種別
  TILES: {
    WALL: 0,
    FLOOR: 1,
    CORRIDOR: 2,
    DOOR: 3,
    STAIRS_DOWN: 4,
  },

  // カラーパレット (参考画像準拠：3D石造りの古代聖域・遺跡調)
  COLORS: {
    BG_DARK: '#070a12',          // 深淵・ダンジョン外枠の闇
    
    // 石積み壁パレット
    WALL_TOP: '#64748b',         // 壁天板の切石ハイライト
    WALL_TOP_DARK: '#475569',    // 壁天板の影
    WALL_FRONT_LIGHT: '#52637a', // 石壁手前面の上部
    WALL_FRONT_MID: '#3c4a5c',   // 石壁手前面の中段
    WALL_FRONT_DARK: '#25303d',  // 石壁手前面の接地部
    WALL_MORTAR: '#1b232c',      // 石壁の目地・境界線
    
    // 敷石床パレット
    FLOOR_BASE: '#8b95a5',       // 敷石の明るいベース色
    FLOOR_INSET: '#7a8596',      // 敷石中央の質感
    FLOOR_MORTAR: '#2c3545',     // 敷石間の目地
    FLOOR_HIGHLIGHT: '#a2adbe',  // 敷石のエッジ光
    FLOOR_SHADOW: '#455062',     // 敷石の落とし影
    
    // 通路パレット
    CORRIDOR_BASE: '#485263',    // 通路の敷石（落ち着いた石色）
    CORRIDOR_LINE: '#f59e0b',    // 通路のランタン光誘導
    
    DOOR: '#f59e0b',
    STAIRS: '#38bdf8',           // 階段の神秘的な輝き
    GOLD: '#fbbf24',
    
    // UIアクセント
    ACCENT_RED: '#f43f5e',
    ACCENT_GREEN: '#10b981',
    ACCENT_BLUE: '#38bdf8',
    ACCENT_PURPLE: '#c084fc',
    ACCENT_AMBER: '#fbbf24',
    
    // 視界・Fog・ライティング
    FOG_VISITED: 'rgba(7, 10, 18, 0.55)',
    FOG_UNSEEN: 'rgba(3, 5, 10, 1.0)',
    LIGHT_TINT: 'rgba(251, 191, 36, 0.15)', // ランタンの温かな琥珀色の光
  }
};
