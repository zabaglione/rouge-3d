/**
 * 3Dクォータービュー（立体パースペクティブ）レンダラー
 * 参考画像に準拠した立体石造りの壁・敷石床・ツタ・ランタン台座・モニュメント
 */
import { CONFIG } from '../config.js?v=20260924_4';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // カメラ位置
    this.cameraX = 0;
    this.cameraY = 0;

    // HUDに覆われる画面上下の領域（px）。プレイヤーを見えている範囲の中央に置くために使う
    this.viewInsetTop = 0;
    this.viewInsetBottom = 0;

    // 照明・アニメーションタイマー
    this.torchTimer = 0;

    // リサイズ処理
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  // HUDに覆われる上下の領域を設定（見えている範囲が画面の半分未満になる場合は無視）
  setViewInsets(top, bottom) {
    const visibleHeight = this.height - top - bottom;
    const usable = visibleHeight >= this.height / 2;
    this.viewInsetTop = usable ? top : 0;
    this.viewInsetBottom = usable ? bottom : 0;
  }

  // グリッド座標から3Dスクリーン座標への変換
  gridToScreen(gx, gy, elevation = 0) {
    return {
      x: gx * CONFIG.TILE_W,
      y: gy * CONFIG.TILE_D - elevation,
    };
  }

  // 決定論的疑似乱数（タイルごとの自然な石の質感の揺らぎに使用）
  tileHash(gx, gy, seed = 0) {
    const n = Math.sin(gx * 12.9898 + gy * 78.233 + seed * 37.719) * 43758.5453;
    return n - Math.floor(n);
  }

  // メイン描画メソッド
  render(game, deltaMs) {
    this.torchTimer += deltaMs * 0.003;
    const ctx = this.ctx;
    const player = game.player;

    // プレイヤーの浮動小数点スクリーン座標
    const pGridX = player.renderX / CONFIG.TILE_SIZE;
    const pGridY = player.renderY / CONFIG.TILE_SIZE;
    const pScreen = this.gridToScreen(pGridX, pGridY);

    // カメラをプレイヤーにスムーズ追従（HUDに覆われていない領域の中央に配置）
    const viewCenterY = this.viewInsetTop + (this.height - this.viewInsetTop - this.viewInsetBottom) / 2;
    const targetCamX = pScreen.x + CONFIG.TILE_W / 2 - this.width / 2;
    const targetCamY = pScreen.y + CONFIG.TILE_D / 2 - viewCenterY;
    this.cameraX += (targetCamX - this.cameraX) * 0.15;
    this.cameraY += (targetCamY - this.cameraY) * 0.15;

    // 背景クリア（深遠の漆黒）
    ctx.fillStyle = CONFIG.COLORS.BG_DARK;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(-Math.round(this.cameraX), -Math.round(this.cameraY));

    // 3Dクォータービューの深度ソート（奥から手前へ）描画
    this.render3DWorld(game, pGridX, pGridY);

    ctx.restore();

    // 動的ライティング＆視界（Fog of War）
    this.renderLightingAndFog(game, pScreen);

    // エフェクト＆アニメーション
    game.animations.render(ctx, this.cameraX, this.cameraY);
  }

  // 奥（gy小）から手前（gy大）へのZソート立体レンダリング
  render3DWorld(game, pGridX, pGridY) {
    const ctx = this.ctx;
    const map = game.map;
    const tw = CONFIG.TILE_W;
    const td = CONFIG.TILE_D;
    const wh = CONFIG.WALL_H;

    // 画面内カリング
    const startGX = Math.max(0, Math.floor(this.cameraX / tw) - 2);
    const endGX = Math.min(map.width - 1, Math.ceil((this.cameraX + this.width) / tw) + 2);
    const startGY = Math.max(0, Math.floor((this.cameraY - wh * 2) / td) - 2);
    const endGY = Math.min(map.height - 1, Math.ceil((this.cameraY + this.height + wh) / td) + 2);

    // --- フェーズ1: 敷石床タイル（地面ベースレイヤー）を一括描画 ---
    for (let gy = startGY; gy <= endGY; gy++) {
      for (let gx = startGX; gx <= endGX; gx++) {
        if (!map.visited[gy][gx]) continue;
        const tile = map.getTile(gx, gy);
        if (tile === CONFIG.TILES.FLOOR || tile === CONFIG.TILES.CORRIDOR || tile === CONFIG.TILES.STAIRS_DOWN) {
          const { x: sx, y: sy } = this.gridToScreen(gx, gy);
          const isVisible = map.visible[gy][gx];
          this.draw3DFloor(ctx, sx, sy, tw, td, tile, isVisible, gx, gy, map);
        }
      }
    }

    // --- フェーズ2: 立体物（壁・アイテム・キャラ・柱・プロップ）を奥から手前へZソート描画 ---
    for (let gy = startGY; gy <= endGY; gy++) {
      // 2-A. この行の「立体石壁（天板・手前面・側面）」を描画
      for (let gx = startGX; gx <= endGX; gx++) {
        if (!map.visited[gy][gx]) continue;
        const tile = map.getTile(gx, gy);
        if (tile !== CONFIG.TILES.WALL) continue;

        const { x: sx, y: sy } = this.gridToScreen(gx, gy);
        const isVisible = map.visible[gy][gx];
        
        // 手前壁オクルージョン判定：プレイヤーの手前側にある壁は半透明化して透かす！
        const isNearFrontWall = (gy >= Math.floor(pGridY) && gy <= Math.floor(pGridY) + 2 && Math.abs(gx - Math.round(pGridX)) <= 2);
        
        this.draw3DWall(ctx, sx, sy, tw, td, wh, map, gx, gy, isNearFrontWall, isVisible);
      }

      // 2-B. この行の「罠」を描画
      for (const trap of map.traps) {
        if (trap.isRevealed && trap.y === gy && map.visible[gy][trap.x]) {
          const { x: tx, y: ty } = this.gridToScreen(trap.x, trap.y);
          this.draw3DTrap(ctx, tx, ty, tw, td, trap);
        }
      }

      // 2-C. この行の「落ちているアイテム」を描画
      for (const item of game.droppedItems) {
        if (item.y === gy && map.visible[gy][item.x]) {
          const { x: ix, y: iy } = this.gridToScreen(item.x, item.y);
          this.draw3DItem(ctx, ix, iy, tw, td, item);
        }
      }

      // 2-D. この行の「モンスター」を描画
      for (const m of game.monsters) {
        if (Math.round(m.renderY / CONFIG.TILE_SIZE) === gy && map.visible[m.y][m.x]) {
          const mGridX = m.renderX / CONFIG.TILE_SIZE;
          const mGridY = m.renderY / CONFIG.TILE_SIZE;
          const { x: mx, y: my } = this.gridToScreen(mGridX, mGridY);
          this.draw3DMonster(ctx, mx, my, tw, td, m);
        }
      }

      // 2-E. プレイヤーがこの行にいれば描画
      if (Math.round(pGridY) === gy) {
        const pScreen = this.gridToScreen(pGridX, pGridY);
        this.draw3DPlayer(ctx, pScreen.x, pScreen.y, tw, td, game.player);
      }

      // 2-F. 部屋の角に立つ「立体石柱＆ランタン台座」および中央モニュメント
      this.drawPropsInRow(ctx, game, gy, startGX, endGX, tw, td, wh, pGridX, pGridY);
    }
  }

  // 3D床タイル描画（参考画像のリアルな敷石・石畳）
  draw3DFloor(ctx, sx, sy, tw, td, tile, isVisible, gx, gy, map) {
    ctx.save();

    if (tile === CONFIG.TILES.FLOOR) {
      // 部屋の床：参考画像のような質感ある敷石プレート (Stone Pavers)
      const h = this.tileHash(gx, gy);
      const h2 = this.tileHash(gx, gy, 1);

      // 目地（Grout）の隙間を空けて敷石を描画
      const pad = 1.5;
      const paverW = tw - pad * 2;
      const paverH = td - pad * 2;
      const px = sx + pad;
      const py = sy + pad;

      // 各敷石の自然なトーン変化（明るい石、サンドストーン調、スレート調）
      let baseColor;
      if (isVisible) {
        if (h < 0.3) {
          baseColor = '#8c95a3'; // 標準ストーングレー
        } else if (h < 0.6) {
          baseColor = '#9aa4b2'; // やや明るい切石
        } else if (h < 0.85) {
          baseColor = '#7e8794'; // やや濃い目の敷石
        } else {
          baseColor = '#889488'; // ほのかに苔むした敷石
        }
      } else {
        baseColor = '#242c38'; // 記憶の中の薄暗い敷石
      }

      // 敷石の丸みを持たせた矩形
      ctx.fillStyle = baseColor;
      this.roundRect(ctx, px, py, paverW, paverH, 3);
      ctx.fill();

      if (isVisible) {
        // 敷石中央のインセット質感
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this.roundRect(ctx, px + 2, py + 2, paverW - 4, paverH - 4, 2);
        ctx.fill();

        // 上辺・左辺の面取りハイライト（光が当たっている立体感）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 2, py + paverH - 2);
        ctx.lineTo(px + 2, py + 2);
        ctx.lineTo(px + paverW - 2, py + 2);
        ctx.stroke();

        // 下辺・右辺の目地シャドウ
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.moveTo(px + paverW - 2, py + 2);
        ctx.lineTo(px + paverW - 2, py + paverH - 2);
        ctx.lineTo(px + 2, py + paverH - 2);
        ctx.stroke();

        // 微妙な石目・苔の斑点（参考画像風の自然な風合い）
        if (h2 > 0.6) {
          ctx.fillStyle = h2 > 0.85 ? 'rgba(74, 120, 80, 0.35)' : 'rgba(0, 0, 0, 0.12)';
          const dotX = px + 6 + (h * 20);
          const dotY = py + 4 + (h2 * 14);
          ctx.beginPath();
          ctx.ellipse(dotX, dotY, 3, 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // 北側が壁の場合：壁の根本に落ちる自然なアンビエントオクルージョン（接地影）
        if (gy > 0 && map.getTile(gx, gy - 1) === CONFIG.TILES.WALL) {
          ctx.fillStyle = 'rgba(10, 15, 26, 0.35)';
          ctx.fillRect(px, py, paverW, 5);
        }
      }
    } else if (tile === CONFIG.TILES.CORRIDOR) {
      // 通路：重厚な石畳キャットウォーク
      ctx.fillStyle = isVisible ? '#3d4756' : '#1a222e';
      ctx.fillRect(sx, sy, tw - 1, td - 1);

      // 通路の石畳グリッド
      ctx.strokeStyle = isVisible ? '#526074' : '#253040';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1, sy + 1, tw - 3, td - 3);

      // 中央の温かなランタン誘導エナジー
      if (isVisible) {
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(sx + tw / 2, sy + td / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (tile === CONFIG.TILES.STAIRS_DOWN) {
      // 階段：地下へ降りる古代石造りの段差ハッチ
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(sx, sy, tw - 1, td - 1);

      // 立体石段ステップ
      const stepCount = 4;
      for (let s = 0; s < stepCount; s++) {
        const stepY = sy + (s * (td / stepCount));
        const stepH = td / stepCount;
        ctx.fillStyle = s % 2 === 0 ? '#334155' : '#475569';
        ctx.fillRect(sx + 4, stepY, tw - 8, stepH);
      }

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.strokeRect(sx + 3, sy + 3, tw - 7, td - 7);
      ctx.shadowBlur = 0;

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', sx + tw / 2, sy + td / 2);
    }

    ctx.restore();
  }

  // 3D立体石壁の描画（参考画像のような重厚なブロック積み壁＋ツタ装飾＋手前壁透過）
  draw3DWall(ctx, sx, sy, tw, td, wh, map, gx, gy, isNearFrontWall, isVisible) {
    const isSouthOpen = (gy < map.height - 1) && map.isWalkable(gx, gy + 1);

    ctx.save();
    // プレイヤーの手前にある壁は半透明化して奥を透かす！
    if (isNearFrontWall) {
      ctx.globalAlpha = 0.22;
    }

    // 1. 壁の天板 (Top Face / Capstone)
    const topY = sy - wh;
    ctx.fillStyle = isVisible ? '#64748b' : '#2e3846';
    ctx.fillRect(sx, topY, tw, td);

    // 天板のハイライト＆目地
    ctx.strokeStyle = isVisible ? '#94a3b8' : '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, topY + 0.5, tw - 1, td - 1);

    // 天板の石ブロック分割線
    ctx.strokeStyle = isVisible ? '#475569' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(sx + tw / 2, topY);
    ctx.lineTo(sx + tw / 2, topY + td);
    ctx.stroke();

    // 2. 壁の手前面 (Front Face) - 南側に空間（部屋や通路）があれば石積み壁を迫力描画！
    if (isSouthOpen) {
      const frontY = topY + td;
      const frontH = wh;

      // 手前面ベース：上段から接地部への立体グラデーション
      const grad = ctx.createLinearGradient(sx, frontY, sx, frontY + frontH);
      if (isVisible) {
        grad.addColorStop(0, '#5a677a');   // 上段：光を受ける切石
        grad.addColorStop(0.5, '#404c5c'); // 中段
        grad.addColorStop(1, '#273240');   // 接地部：影
      } else {
        grad.addColorStop(0, '#2b3340');
        grad.addColorStop(1, '#151b24');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(sx, frontY, tw, frontH);

      // 外周枠線
      ctx.strokeStyle = isVisible ? '#64748b' : '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, frontY, tw, frontH);

      // 参考画像のような3段の石積みブロック（Courses of Ashlar Masonry）
      const courseH = frontH / 3;
      ctx.strokeStyle = isVisible ? '#222c38' : '#11171f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // 2本の水平目地
      ctx.moveTo(sx, frontY + courseH);
      ctx.lineTo(sx + tw, frontY + courseH);
      ctx.moveTo(sx, frontY + courseH * 2);
      ctx.lineTo(sx + tw, frontY + courseH * 2);

      // 互い違い（千鳥配置）の垂直目地
      const shift = (gx % 2 === 0) ? tw / 3 : (tw * 2) / 3;
      // 1段目の垂直目地
      ctx.moveTo(sx + shift, frontY);
      ctx.lineTo(sx + shift, frontY + courseH);
      // 2段目の垂直目地（逆シフト）
      const shift2 = (gx % 2 === 0) ? (tw * 2) / 3 : tw / 3;
      ctx.moveTo(sx + shift2, frontY + courseH);
      ctx.lineTo(sx + shift2, frontY + courseH * 2);
      // 3段目の垂直目地
      ctx.moveTo(sx + tw / 2, frontY + courseH * 2);
      ctx.lineTo(sx + tw / 2, frontY + frontH);
      ctx.stroke();

      // 各ブロック上辺の面取りハイライト（立体感の向上）
      if (isVisible) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 1, frontY + 1);
        ctx.lineTo(sx + tw - 1, frontY + 1);
        ctx.moveTo(sx + 1, frontY + courseH + 1);
        ctx.lineTo(sx + tw - 1, frontY + courseH + 1);
        ctx.moveTo(sx + 1, frontY + courseH * 2 + 1);
        ctx.lineTo(sx + tw - 1, frontY + courseH * 2 + 1);
        ctx.stroke();

        // 参考画像のように天板から美しく垂れ下がるツタと緑の葉（Ivy & Foliage）
        const vineSeed = (gx * 7 + gy * 13) % 4;
        if (vineSeed <= 2) {
          this.drawHangingIvy(ctx, sx, frontY, tw, vineSeed);
        }
      }
    }

    // 3. 西壁の内側面（東向き面：部屋の左側の壁）の立体感
    const isEastOpen = (gx < map.width - 1) && map.isWalkable(gx + 1, gy);
    if (isEastOpen && !isSouthOpen) {
      const sideW = 8;
      const sideX = sx + tw - sideW;
      const sideY = topY + td;
      const sideH = wh;
      const sideGrad = ctx.createLinearGradient(sideX, sideY, sideX + sideW, sideY);
      sideGrad.addColorStop(0, isVisible ? '#3d4856' : '#1e242d');
      sideGrad.addColorStop(1, isVisible ? '#222a34' : '#10151c');
      ctx.fillStyle = sideGrad;
      ctx.fillRect(sideX, sideY, sideW, sideH);

      ctx.strokeStyle = isVisible ? '#475569' : '#1e293b';
      ctx.lineWidth = 1;
      ctx.strokeRect(sideX, sideY, sideW, sideH);
    }

    ctx.restore();
  }

  // 参考画像風の垂れ下がるツタと葉の描画
  drawHangingIvy(ctx, sx, frontY, tw, seed) {
    ctx.save();
    // 茎（Vine Stems）
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const stemX1 = sx + 8 + seed * 6;
    const stemLen1 = 16 + (seed * 5);
    ctx.moveTo(stemX1, frontY);
    ctx.bezierCurveTo(stemX1 - 3, frontY + 8, stemX1 + 4, frontY + 12, stemX1, frontY + stemLen1);

    const stemX2 = sx + 24 + seed * 4;
    const stemLen2 = 12 + (seed * 4);
    ctx.moveTo(stemX2, frontY);
    ctx.bezierCurveTo(stemX2 + 4, frontY + 6, stemX2 - 2, frontY + 10, stemX2 + 2, frontY + stemLen2);
    ctx.stroke();

    // 葉（Leaves Clustered）
    const drawLeaf = (lx, ly, size, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(lx, ly, size, size * 0.6, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    };

    drawLeaf(stemX1 - 2, frontY + 6, 3.5, '#22c55e');
    drawLeaf(stemX1 + 3, frontY + 10, 4, '#4ade80');
    drawLeaf(stemX1, frontY + stemLen1, 3, '#16a34a');

    drawLeaf(stemX2 + 2, frontY + 5, 3.5, '#4ade80');
    drawLeaf(stemX2 - 2, frontY + 9, 3, '#22c55e');
    drawLeaf(stemX2 + 1, frontY + stemLen2, 2.5, '#15803d');

    ctx.restore();
  }

  // 部屋の角の「立体石柱＆ランタン台座」および中央モニュメント
  drawPropsInRow(ctx, game, gy, startGX, endGX, tw, td, wh, pGridX, pGridY) {
    const rooms = game.map.rooms;

    for (const r of rooms) {
      // 1. 部屋の四隅のランタン台座
      const corners = [
        { gx: r.x, gy: r.y },                         // 北西角
        { gx: r.x + r.w - 1, gy: r.y },               // 北東角
        { gx: r.x, gy: r.y + r.h - 1 },               // 南西角
        { gx: r.x + r.w - 1, gy: r.y + r.h - 1 },     // 南東角
      ];

      for (const c of corners) {
        if (c.gy !== gy) continue;
        if (c.gx < startGX || c.gx > endGX) continue;
        if (!game.map.visited[c.gy][c.gx]) continue;

        const { x: sx, y: sy } = this.gridToScreen(c.gx, c.gy);
        const pillarH = wh + 12;
        const pillarW = 22;
        const px = sx + (tw - pillarW) / 2;
        const py = sy - pillarH + 8;

        // プレイヤーの手前なら半透明化
        const isNearPlayer = (Math.abs(c.gx - pGridX) <= 1 && c.gy >= pGridY);

        ctx.save();
        if (isNearPlayer) ctx.globalAlpha = 0.35;

        // 1. 台座の接地影
        ctx.beginPath();
        ctx.ellipse(sx + tw / 2, sy + td / 2, 14, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fill();

        // 2. 石造り角柱本体（参考画像のAshlar Stone Pedestal）
        const pillarGrad = ctx.createLinearGradient(px, py + 18, px + pillarW, py + 18);
        pillarGrad.addColorStop(0, '#5a697c');
        pillarGrad.addColorStop(0.5, '#435162');
        pillarGrad.addColorStop(1, '#2c3744');
        ctx.fillStyle = pillarGrad;
        ctx.fillRect(px, py + 18, pillarW, pillarH - 10);

        // 台座の目地
        ctx.strokeStyle = '#222b36';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py + 18, pillarW, pillarH - 10);
        ctx.beginPath();
        ctx.moveTo(px, py + 18 + (pillarH - 10) / 2);
        ctx.lineTo(px + pillarW, py + 18 + (pillarH - 10) / 2);
        ctx.stroke();

        // 柱に巻き付くツタ
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(px + 3, py + 26, 4, 8);
        ctx.fillRect(px + pillarW - 7, py + 34, 4, 6);

        // 3. 台座の頭部石板（Plinth Capstone）
        ctx.fillStyle = '#718096';
        ctx.fillRect(px - 3, py + 13, pillarW + 6, 6);
        ctx.strokeStyle = '#a0aec0';
        ctx.strokeRect(px - 3, py + 13, pillarW + 6, 6);

        // 4. ランタン（参考画像の温かな明かりを放つランタン）
        // ランタンの柔らかな光の輪（Pool of Light）
        const flicker = Math.sin(this.torchTimer * 8 + c.gx) * 2;
        const lanternGlow = ctx.createRadialGradient(sx + tw / 2, py + 6, 4, sx + tw / 2, py + 6, 45 + flicker);
        lanternGlow.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
        lanternGlow.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)');
        lanternGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lanternGlow;
        ctx.beginPath();
        ctx.arc(sx + tw / 2, py + 6, 45 + flicker, 0, Math.PI * 2);
        ctx.fill();

        // ランタン本体（鉄枠＋ガラス灯芯）
        ctx.fillStyle = '#1e293b'; // 鉄枠ベース
        ctx.fillRect(sx + tw / 2 - 6, py + 3, 12, 10);
        ctx.fillStyle = '#fbbf24'; // 発光ガラス
        ctx.fillRect(sx + tw / 2 - 4, py + 5, 8, 6);
        // 屋根キャップ
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(sx + tw / 2 - 7, py + 3);
        ctx.lineTo(sx + tw / 2 + 7, py + 3);
        ctx.lineTo(sx + tw / 2, py - 3);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // 2. 広い部屋の中央モニュメント（参考画像の古代羅針盤石碑）
      if (r.w >= 7 && r.h >= 6 && r.centerY === gy && startGX <= r.centerX && r.centerX <= endGX) {
        if (game.map.visited[r.centerY][r.centerX]) {
          const isOccupied = (game.player.x === r.centerX && game.player.y === r.centerY) ||
                             game.monsters.some(m => m.x === r.centerX && m.y === r.centerY) ||
                             game.droppedItems.some(it => it.x === r.centerX && it.y === r.centerY);

          if (!isOccupied) {
            const { x: mx, y: my } = this.gridToScreen(r.centerX, r.centerY);
            ctx.save();
            // 台座の円形影
            ctx.beginPath();
            ctx.ellipse(mx + tw / 2, my + td / 2, 16, 7, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fill();

            // 円形石造り基壇
            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.ellipse(mx + tw / 2, my + td / 2 - 3, 14, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#94a3b8';
            ctx.stroke();

            // 中央の石碑（Stele）
            ctx.fillStyle = '#475569';
            ctx.fillRect(mx + tw / 2 - 8, my + td / 2 - 18, 16, 15);
            ctx.strokeStyle = '#94a3b8';
            ctx.strokeRect(mx + tw / 2 - 8, my + td / 2 - 18, 16, 15);

            // 彫刻（星・羅針盤）
            ctx.fillStyle = '#fbbf24';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✦', mx + tw / 2, my + td / 2 - 10);
            ctx.restore();
          }
        }
      }

      // 3. 参考画像風の木製ベンチ＆素焼きの壺（部屋の北側壁沿い）
      if (r.w >= 6 && r.h >= 5 && (r.y) === gy && startGX <= (r.x + 2) && (r.x + 2) <= endGX) {
        const bx = r.x + 2;
        const by = r.y;
        if (game.map.visited[by][bx]) {
          const isOccupied = (game.player.x === bx && game.player.y === by) ||
                             game.monsters.some(m => m.x === bx && m.y === by);
          if (!isOccupied) {
            const { x: sx, y: sy } = this.gridToScreen(bx, by);
            ctx.save();
            // ベンチの影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(sx + 2, sy + td / 2, tw - 10, 6);

            // 木製ベンチ（座面・脚・背もたれ）
            ctx.fillStyle = '#854d0e'; // 木の座面
            ctx.fillRect(sx + 3, sy + td / 2 - 5, tw - 12, 5);
            ctx.fillStyle = '#a16207';
            ctx.fillRect(sx + 3, sy + td / 2 - 11, tw - 12, 4); // 背もたれ
            // 脚
            ctx.fillStyle = '#543007';
            ctx.fillRect(sx + 5, sy + td / 2, 3, 5);
            ctx.fillRect(sx + tw - 12, sy + td / 2, 3, 5);

            // ベンチ脇の素焼きの壺（Urn/Vase）
            ctx.fillStyle = '#ca8a04';
            ctx.beginPath();
            ctx.arc(sx + tw - 4, sy + td / 2 - 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#854d0e';
            ctx.fillRect(sx + tw - 5, sy + td / 2 - 6, 2.5, 2);
            ctx.restore();
          }
        }
      }

      // 4. 参考画像風の部屋の隅の白野草・薬草（Wildflowers）
      if (r.w >= 5 && (r.y) === gy && startGX <= (r.x + 1) && (r.x + 1) <= endGX) {
        const fx = r.x + 1;
        const fy = r.y;
        if (game.map.visited[fy][fx]) {
          const { x: sx, y: sy } = this.gridToScreen(fx, fy);
          ctx.save();
          ctx.fillStyle = '#22c55e'; // 葉
          ctx.fillRect(sx + 6, sy + 6, 2, 6);
          ctx.fillRect(sx + 10, sy + 8, 2, 5);
          ctx.fillStyle = '#ffffff'; // 白い花
          ctx.fillRect(sx + 5, sy + 4, 3, 3);
          ctx.fillRect(sx + 10, sy + 6, 3, 3);
          ctx.restore();
        }
      }
    }
  }

  // 3D罠描画
  draw3DTrap(ctx, tx, ty, tw, td, trap) {
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(tx + 4, ty + 4, tw - 8, td - 8);
    ctx.strokeStyle = trap.type.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx + 4, ty + 4, tw - 8, td - 8);

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(trap.type.icon, tx + tw / 2, ty + td / 2);
    ctx.restore();
  }

  // 3Dアイテム描画（上下ふんわり浮遊＋光輪）
  draw3DItem(ctx, ix, iy, tw, td, item) {
    const floatOffset = Math.sin(this.torchTimer * 4) * 3;
    const cx = ix + tw / 2;
    const cy = iy + td / 2;

    ctx.save();
    // 敷石の上の影
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 12, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fill();

    // アイテム発光オーラ
    ctx.beginPath();
    ctx.arc(cx, cy - 8 + floatOffset, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
    ctx.fill();

    // アイテムスプライト
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = item.color || '#fbbf24';
    ctx.shadowBlur = 10;
    ctx.fillText(item.icon, cx, cy - 8 + floatOffset);
    ctx.restore();
  }

  // 3Dモンスター描画（参考画像のようなファンタジー生物・スライム・死神等）
  draw3DMonster(ctx, mx, my, tw, td, m) {
    const cx = mx + tw / 2;
    const cy = my + td / 2;

    ctx.save();
    // 被弾フラッシュ
    if (m.damageAnimTimer > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // 床のドロップシャドウ
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 14, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    // モンスター本体
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 10;
    ctx.fillText(m.icon, cx, cy - 10);

    // 状態異常アイコン
    if (m.statusEffects.sleep > 0) {
      ctx.font = '12px sans-serif';
      ctx.fillText('💤', cx + 12, cy - 26);
    } else if (m.statusEffects.confused > 0) {
      ctx.font = '12px sans-serif';
      ctx.fillText('🌀', cx + 12, cy - 26);
    } else if (m.statusEffects.paralyzed > 0) {
      ctx.font = '12px sans-serif';
      ctx.fillText('⛓️', cx + 12, cy - 26);
    }

    // HPバー
    if (m.hp < m.maxHp) {
      const barW = tw - 12;
      const barH = 4;
      const barX = cx - barW / 2;
      const barY = cy - 28;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(barX, barY, barW, barH);
      const hpRatio = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = hpRatio > 0.4 ? '#10b981' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }

    ctx.restore();
  }

  // 3Dプレイヤー描画（参考画像の愛らしい冒険者・高コントラスト・エナジーリング）
  draw3DPlayer(ctx, px, py, tw, td, player) {
    const cx = px + tw / 2;
    const cy = py + td / 2;

    ctx.save();

    // 1. 敷石の上の楕円ドロップシャドウ
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 15, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    // 2. 足元エナジーリング（脈動するシアンの探索リング）
    const pulseRing = Math.sin(this.torchTimer * 8) * 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 16 + pulseRing, 7 + pulseRing * 0.4, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. 向きポインター（ネオンゴールド／シアンの矢印）
    const dir = player.facing;
    const pointerDist = 22;
    const pointerX = cx + dir.dx * pointerDist;
    const pointerY = cy + dir.dy * (pointerDist * 0.72); // 3Dパース補正

    ctx.save();
    ctx.translate(pointerX, pointerY);
    ctx.rotate(dir.angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 3);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 4. 背景埋没防止のダークオーラプレート
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7, 10, 18, 0.7)';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 5. 被弾フラッシュ
    if (player.damageAnimTimer > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. 冒険者キャラクター（参考画像の愛らしいマント付き金髪勇者）
    this.drawHeroAdventurer(ctx, cx, cy, dir, player.damageAnimTimer > 0);

    // 7. 状態異常
    if (player.statusEffects.sleep > 0) {
      ctx.font = '14px sans-serif';
      ctx.fillText('💤', cx + 14, cy - 26);
    }

    ctx.restore();
  }

  // 参考画像完全準拠の冒険者（マント・革鎧・髪型・剣）
  drawHeroAdventurer(ctx, cx, cy, dir, isDamage) {
    ctx.save();
    
    // 微細な息遣い・歩行の揺れ
    const bobY = Math.sin(this.torchTimer * 8) * 1.0;
    const baseY = cy - 2 + bobY;

    // 1. 赤いマント (Fluttering Crimson Cape) - 体の背後
    ctx.fillStyle = isDamage ? '#f87171' : '#dc2626';
    ctx.beginPath();
    const capeFlutter = Math.sin(this.torchTimer * 6) * 2.5;
    ctx.moveTo(cx - 7, baseY - 12);
    ctx.lineTo(cx + 7, baseY - 12);
    ctx.lineTo(cx + 8 + capeFlutter, baseY + 4);
    ctx.lineTo(cx - 8 - capeFlutter * 0.5, baseY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. 胴体・チュニック＆革鎧 (Adventurer Tunic & Leather Armor)
    ctx.fillStyle = isDamage ? '#ffffff' : '#334155'; // ネイビーの冒険者服
    ctx.fillRect(cx - 6, baseY - 14, 12, 10);
    // レザーベルト＆金バックル
    ctx.fillStyle = '#b45309';
    ctx.fillRect(cx - 6, baseY - 7, 12, 2.5);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cx - 1.5, baseY - 7.5, 3, 3.5);

    // 3. ブーツ (Boots)
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx - 5, baseY - 4, 4, 6);
    ctx.fillRect(cx + 1, baseY - 4, 4, 6);

    // 4. 頭部・肌 (Anime Adventurer Face)
    ctx.fillStyle = isDamage ? '#fca5a5' : '#fed7aa';
    ctx.beginPath();
    ctx.arc(cx, baseY - 18, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // 目 (Eyes)
    ctx.fillStyle = '#1e293b';
    const eyeOffsetX = dir.dx * 1.5;
    ctx.fillRect(cx - 2.5 + eyeOffsetX, baseY - 19, 1.5, 2.5);
    ctx.fillRect(cx + 1 + eyeOffsetX, baseY - 19, 1.5, 2.5);

    // 5. 髪型 (Spiky Blond/Chestnut Adventurer Hair - 参考画像の髪型)
    ctx.fillStyle = isDamage ? '#ffffff' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx, baseY - 20, 7.5, Math.PI, 0); // 頭頂部
    ctx.lineTo(cx + 8, baseY - 16);
    ctx.lineTo(cx + 5, baseY - 18);
    ctx.lineTo(cx + 2, baseY - 16);
    ctx.lineTo(cx - 1, baseY - 19);
    ctx.lineTo(cx - 4, baseY - 16);
    ctx.lineTo(cx - 8, baseY - 17);
    ctx.closePath();
    ctx.fill();

    // 6. 剣 (Adventurer Sword)
    ctx.save();
    ctx.translate(cx + 7, baseY - 10);
    ctx.rotate(Math.PI / 4);
    // 刃
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, -6, 2, 8);
    // 鍔
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-2, 2, 6, 1.5);
    // 柄
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, 3.5, 2, 3);
    ctx.restore();

    ctx.restore();
  }

  // 動的ライティング＆視界（Fog of War）
  renderLightingAndFog(game, pScreen) {
    const ctx = this.ctx;
    const tw = CONFIG.TILE_W;
    const td = CONFIG.TILE_D;

    const screenPlayerX = Math.round(pScreen.x + tw / 2 - this.cameraX);
    const screenPlayerY = Math.round(pScreen.y + td / 2 - this.cameraY);

    const pulse = Math.sin(this.torchTimer * 6) * 4;
    const lightRadius = 220 + pulse;

    ctx.save();

    // プレイヤーの周囲を温かく照らすランタン・トーチ光のハロー
    const grad = ctx.createRadialGradient(screenPlayerX, screenPlayerY, 30, screenPlayerX, screenPlayerY, lightRadius);
    grad.addColorStop(0, 'rgba(254, 243, 199, 0.12)');
    grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.06)');
    grad.addColorStop(0.85, 'rgba(15, 23, 42, 0.25)');
    grad.addColorStop(1, 'rgba(7, 10, 18, 0.65)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.restore();
  }

  // 角丸矩形ヘルパー関数
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
