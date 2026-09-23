/**
 * 歩いたマップの透過オーバーレイ＆ミニマップ表示システム
 * コントローラーのL1/Select/Mキー/ボタンで【全画面透過 / ミニマップ / 非表示】をワンタッチ切替
 */
import { CONFIG } from '../config.js';

export const MAP_MODES = {
  FULL_OVERLAY: 'full_overlay', // SFCシレン風 画面中央の半透明大マップ
  MINI_MAP: 'mini_map',         // 画面右上の小型ミニマップ
  OFF: 'off',                   // 非表示
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

  render(ctx, screenW, screenH, game) {
    if (this.mode === MAP_MODES.OFF) return;

    const map = game.map;
    const player = game.player;

    if (this.mode === MAP_MODES.FULL_OVERLAY) {
      this.renderFullOverlay(ctx, screenW, screenH, game);
    } else if (this.mode === MAP_MODES.MINI_MAP) {
      this.renderMiniMap(ctx, screenW, screenH, game);
    }
  }

  // SFCシレン風 中央の透過大マップ
  renderFullOverlay(ctx, screenW, screenH, game) {
    const map = game.map;
    const player = game.player;

    // 画面中央に収まるスケールを計算（モバイル縦長時は余白を狭めて見やすく）
    const padding = screenW < 600 ? 20 : 70;
    const availableW = screenW - padding * 2;
    const availableH = screenH - (screenW < 600 ? 180 : padding * 2);

    const cellW = Math.min(16, Math.floor(availableW / map.width));
    const cellH = Math.min(16, Math.floor(availableH / map.height));
    const cellSize = Math.max(3, Math.min(cellW, cellH));

    const totalMapW = map.width * cellSize;
    const totalMapH = map.height * cellSize;

    const startX = Math.round((screenW - totalMapW) / 2);
    const startY = Math.round((screenH - totalMapH) / 2);

    ctx.save();
    // 全体背景：極力薄いグラス調（ゲーム画面を暗くしない）
    ctx.fillStyle = 'rgba(5, 10, 20, 0.28)';
    ctx.fillRect(startX - 8, startY - 8, totalMapW + 16, totalMapH + 16);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX - 8, startY - 8, totalMapW + 16, totalMapH + 16);

    // タイトルバッジ
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.fillText('MAP [L1 / M / Tab]', startX, startY - 14);

    // 探索済みタイルの描画
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.visited[y][x]) continue;

        const tile = map.getTile(x, y);
        const px = startX + x * cellSize;
        const py = startY + y * cellSize;

        if (tile === CONFIG.TILES.FLOOR) {
          ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (tile === CONFIG.TILES.CORRIDOR) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
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
  renderMiniMap(ctx, screenW, screenH, game) {
    const map = game.map;
    const player = game.player;

    const isMobile = screenW < 600;
    const cellSize = isMobile ? 2.5 : 4;
    const totalW = map.width * cellSize;
    const totalH = map.height * cellSize;

    const margin = isMobile ? 8 : 16;
    const startX = screenW - totalW - margin;
    const startY = isMobile ? 96 : margin + 54; // ヘッダーHUDの下

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
