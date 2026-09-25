/**
 * 歩いたマップの透過オーバーレイ＆ミニマップ表示システム
 * コントローラーのL1/Select/Mキー/ボタンで【全画面透過 / ミニマップ / 非表示】をワンタッチ切替
 */
import { CONFIG } from '../config.js?v=20260925_04';
import { MONSTER_GLYPHS } from '../gfx/glyphs.js?v=20260925_04';

// アイテムの分類記号（NetHack）
const ITEM_CLASS_GLYPHS = {
  weapon: ')', shield: '[', food: '%', herb: '!', scroll: '?', staff: '/', arrow: ')', gold: '$',
};
// 地形の記号と色
const FEATURE_GLYPHS = {
  fountain: ['{', '#60a5fa'], sink: ['#', '#cbd5e1'], altar: ['_', '#e5e7eb'], grave: ['|', '#e5e7eb'],
};

export const MAP_MODES = {
  FULL_OVERLAY: 'full_overlay', // SFCシレン風 画面中央の半透明大マップ
  MINI_MAP: 'mini_map',         // 画面右上の小型ミニマップ
  OFF: 'off',                   // 非表示
};

// 中央全体マップの表示設定
const FULL_MAP_STYLE = {
  BACKDROP: 'rgba(3, 6, 12, 0.82)', // ゲーム画面を暗くしてマップを読みやすくする
  MOBILE_BREAKPOINT: 600,
  SCREEN_MARGIN: { mobile: 12, desktop: 70 },
  TITLE_HEIGHT: 22,
  FRAME_PADDING: 8,
  MAX_CELL: 16,
  MIN_CELL: 3,
};

export class OverlayMap {
  constructor() {
    this.mode = MAP_MODES.MINI_MAP; // 初期状態は右上のミニマップ（ゲーム画面を覆わない）
  }

  // 表示モードのトグル（MINI_MAP -> FULL_OVERLAY -> OFF -> MINI_MAP）
  cycleMode() {
    if (this.mode === MAP_MODES.MINI_MAP) {
      this.mode = MAP_MODES.FULL_OVERLAY;
    } else if (this.mode === MAP_MODES.FULL_OVERLAY) {
      this.mode = MAP_MODES.OFF;
    } else {
      this.mode = MAP_MODES.MINI_MAP;
    }
    return this.mode;
  }

  setMode(mode) {
    this.mode = mode;
  }

  // renderer の viewInset（HUDに覆われる上下領域）を避けて描画する
  render(renderer, game) {
    if (this.mode === MAP_MODES.OFF) return;

    if (this.mode === MAP_MODES.FULL_OVERLAY) {
      this.renderFullOverlay(renderer, game);
    } else if (this.mode === MAP_MODES.MINI_MAP) {
      this.renderMiniMap(renderer, game);
    }
  }

  // SFCシレン風 画面全体を暗転させた大マップ
  renderFullOverlay(renderer, game) {
    const { ctx, width: screenW, height: screenH, viewInsetTop, viewInsetBottom } = renderer;
    const map = game.map;
    const player = game.player;
    const style = FULL_MAP_STYLE;

    // HUDに覆われていない領域いっぱいに収まるスケールを計算
    const margin = screenW < style.MOBILE_BREAKPOINT ? style.SCREEN_MARGIN.mobile : style.SCREEN_MARGIN.desktop;
    const areaTop = viewInsetTop + style.TITLE_HEIGHT;
    const availableW = screenW - margin * 2;
    const availableH = screenH - areaTop - viewInsetBottom - style.FRAME_PADDING * 2;

    const cellW = Math.floor(availableW / map.width);
    const cellH = Math.floor(availableH / map.height);
    const cellSize = Math.max(style.MIN_CELL, Math.min(style.MAX_CELL, cellW, cellH));

    const totalMapW = map.width * cellSize;
    const totalMapH = map.height * cellSize;

    const startX = Math.round((screenW - totalMapW) / 2);
    const startY = Math.round(areaTop + (availableH - totalMapH) / 2 + style.FRAME_PADDING);
    const pad = style.FRAME_PADDING;

    ctx.save();
    // 画面全体を暗転させ、マップを主役にする
    ctx.fillStyle = style.BACKDROP;
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX - pad, startY - pad, totalMapW + pad * 2, totalMapH + pad * 2);

    // タイトルバッジ
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillText(`地下 ${game.currentFloor} 階 MAP  [M / 地図] で切替`, startX - pad, startY - pad - 6);

    // NetHack 風の文字で描く（探索済みの場所だけ。今見えている場所は明るく）
    const font = `${Math.max(8, Math.round(cellSize * 1.15))}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const put = (x, y, ch, color, glow = false) => {
      const px = startX + x * cellSize + cellSize / 2;
      const py = startY + y * cellSize + cellSize / 2;
      ctx.shadowBlur = glow ? 8 : 0;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.fillText(ch, px, py);
    };
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.visited[y][x]) continue;
        const [ch, color] = this.tileGlyph(map, x, y);
        if (!ch) continue;
        put(x, y, ch, map.visible[y][x] ? color : this.dim(color));
      }
    }

    // 見つけた罠
    for (const t of map.traps) {
      if (t.isRevealed && map.visited[t.y][t.x]) put(t.x, t.y, '^', t.type.color || '#f472b6');
    }

    // アイテム（NetHack の分類記号）
    for (const item of game.droppedItems) {
      if (map.visited[item.y][item.x]) put(item.x, item.y, ITEM_CLASS_GLYPHS[item.type] || '*', item.color || '#fbbf24');
    }

    // 見えているモンスター（クラス文字）
    for (const m of game.monsters) {
      if (!map.visible[m.y][m.x]) continue;
      put(m.x, m.y, m.isMimic ? ']' : (MONSTER_GLYPHS[m.defId] || '?'), m.color, true);
    }

    // プレイヤー
    put(player.x, player.y, '@', '#ffffff', true);

    ctx.restore();
  }

  // マスの記号と色（壁は上下に床があれば '-'、左右なら '|'）
  tileGlyph(map, x, y) {
    const T = CONFIG.TILES;
    const tile = map.getTile(x, y);
    const feat = map.getFeature(x, y);
    if (feat) return FEATURE_GLYPHS[feat.type];
    if (map.stairs && map.stairs.x === x && map.stairs.y === y) return ['>', '#fde047'];
    if (tile === T.FLOOR) return ['.', '#94a3b8'];
    if (tile === T.CORRIDOR) return ['#', '#8b8b8b'];
    if (tile === T.DOOR) {
      const d = map.getDoor(x, y);
      const state = d ? d.state : 'none';
      if (state === 'closed' || state === 'locked') return ['+', '#d97706'];
      if (state === 'open') {
        const ns = map.getTile(x - 1, y) === T.WALL && map.getTile(x + 1, y) === T.WALL;
        return [ns ? '|' : '-', '#d97706'];
      }
      return ['.', '#d97706'];
    }
    // 壁：部屋（洞窟・迷路では床）に接しているものだけ。NetHack と同じく通路の周りには壁を描かない
    const open = (xx, yy) => {
      const t = map.getTile(xx, yy);
      return t === T.FLOOR || t === T.DOOR || t === T.STAIRS_DOWN;
    };
    if (open(x, y - 1) || open(x, y + 1)) return ['-', '#a1a1aa'];
    if (open(x - 1, y) || open(x + 1, y)) return ['|', '#a1a1aa'];
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (open(x + dx, y + dy)) return ['-', '#a1a1aa'];
    }
    return [null, null];
  }

  // 今は見えていない場所の色（暗く青みがかる）
  dim(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.48)}, ${Math.round(b * 0.6)})`;
  }

  // マスの記号と色（壁は上下に床があれば '-'、左右なら '|'）
  tileGlyph(map, x, y) {
    const T = CONFIG.TILES;
    const tile = map.getTile(x, y);
    const feat = map.getFeature(x, y);
    if (feat) return FEATURE_GLYPHS[feat.type];
    if (map.stairs && map.stairs.x === x && map.stairs.y === y) return ['>', '#fde047'];
    if (tile === T.FLOOR) return ['.', '#94a3b8'];
    if (tile === T.CORRIDOR) return ['#', '#8b8b8b'];
    if (tile === T.DOOR) {
      const d = map.getDoor(x, y);
      const state = d ? d.state : 'none';
      if (state === 'closed' || state === 'locked') return ['+', '#d97706'];
      if (state === 'open') {
        const ns = map.getTile(x - 1, y) === T.WALL && map.getTile(x + 1, y) === T.WALL;
        return [ns ? '|' : '-', '#d97706'];
      }
      return ['.', '#d97706'];
    }
    // 壁：部屋（洞窟・迷路では床）に接しているものだけ。NetHack と同じく通路の周りには壁を描かない
    const open = (xx, yy) => {
      const t = map.getTile(xx, yy);
      return t === T.FLOOR || t === T.DOOR || t === T.STAIRS_DOWN;
    };
    if (open(x, y - 1) || open(x, y + 1)) return ['-', '#a1a1aa'];
    if (open(x - 1, y) || open(x + 1, y)) return ['|', '#a1a1aa'];
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (open(x + dx, y + dy)) return ['-', '#a1a1aa'];
    }
    return [null, null];
  }

  // 今は見えていない場所の色（暗く青みがかる）
  dim(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.48)}, ${Math.round(b * 0.6)})`;
  }

  // 画面右上の小型ミニマップ
  renderMiniMap(renderer, game) {
    const { ctx, width: screenW, viewInsetTop } = renderer;
    const map = game.map;
    const player = game.player;

    const isMobile = screenW < 600;
    const cellSize = isMobile ? 2.5 : 4;
    const totalW = map.width * cellSize;
    const totalH = map.height * cellSize;

    const margin = isMobile ? 8 : 16;
    const startX = screenW - totalW - margin;
    const startY = viewInsetTop + margin; // ヘッダーHUDの下

    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 23, 0.75)';
    ctx.fillRect(startX - 4, startY - 4, totalW + 8, totalH + 8);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX - 4, startY - 4, totalW + 8, totalH + 8);

    // 探索済みタイル
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.visited[y][x]) continue;

        const tile = map.getTile(x, y);
        const px = startX + x * cellSize;
        const py = startY + y * cellSize;

        if (tile === CONFIG.TILES.FLOOR || tile === CONFIG.TILES.CORRIDOR) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (tile === CONFIG.TILES.DOOR) {
          ctx.fillStyle = 'rgba(217, 119, 6, 0.85)';
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (tile === CONFIG.TILES.STAIRS_DOWN) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(px, py, cellSize, cellSize);
        }
      }
    }

    // プレイヤー
    const ppx = startX + player.x * cellSize;
    const ppy = startY + player.y * cellSize;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 6;
    ctx.fillRect(ppx, ppy, cellSize + 1, cellSize + 1);

    ctx.restore();
  }
}
