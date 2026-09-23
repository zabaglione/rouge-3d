/**
 * 歩いたマップの透過オーバーレイ＆ミニマップ表示システム
 * コントローラーのL1/Select/Mキー/ボタンで【全画面透過 / ミニマップ / 非表示】をワンタッチ切替
 */
import { CONFIG } from '../config.js?v=20260924_6';

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
  FLOOR_COLOR: 'rgba(100, 116, 139, 0.85)',
  CORRIDOR_COLOR: 'rgba(148, 163, 184, 0.9)',
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

    // 探索済みタイルの描画
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.visited[y][x]) continue;

        const tile = map.getTile(x, y);
        const px = startX + x * cellSize;
        const py = startY + y * cellSize;

        if (tile === CONFIG.TILES.FLOOR) {
          ctx.fillStyle = style.FLOOR_COLOR;
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (tile === CONFIG.TILES.CORRIDOR) {
          ctx.fillStyle = style.CORRIDOR_COLOR;
          ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
        } else if (tile === CONFIG.TILES.STAIRS_DOWN) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(px, py, cellSize, cellSize);
        }
      }
    }

    // 階段の強調（探索済みなら点滅）
    if (map.stairs && map.visited[map.stairs.y][map.stairs.x]) {
      const spx = startX + map.stairs.x * cellSize;
      const spy = startY + map.stairs.y * cellSize;
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.fillRect(spx, spy, cellSize, cellSize);
    }

    // アイテム（視界内、またはあかりの巻物効果中：黄色い点）
    for (const item of game.droppedItems) {
      if (map.visited[item.y][item.x]) {
        const ipx = startX + item.x * cellSize;
        const ipy = startY + item.y * cellSize;
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(ipx + cellSize / 2, ipy + cellSize / 2, Math.max(2, cellSize * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // モンスター（視界内：赤い点）
    for (const m of game.monsters) {
      if (map.visible[m.y][m.x]) {
        const mpx = startX + m.x * cellSize;
        const mpy = startY + m.y * cellSize;
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(mpx + cellSize / 2, mpy + cellSize / 2, Math.max(2.5, cellSize * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // プレイヤー（点滅する明るいシアンの点）
    const ppx = startX + player.x * cellSize;
    const ppy = startY + player.y * cellSize;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(ppx + cellSize / 2, ppy + cellSize / 2, Math.max(3, cellSize * 0.45), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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
