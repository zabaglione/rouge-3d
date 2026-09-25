/**
 * ダンジョンマップ状態管理・視界 (FoV)・通行/角抜け判定
 */
import { CONFIG } from '../config.js?v=20260925_01';
import { Trap, TRAP_TYPES } from './Trap.js?v=20260925_01';

export class DungeonMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.rooms = [];
    this.stairs = null;
    
    // 視界＆探索情報
    this.visited = []; // 一度でも視界に入ったことがあるか
    this.visible = []; // 現在リアルタイムで視界内にあるか

    // トラップ一覧
    this.traps = [];
  }

  init(genData) {
    this.tiles = genData.tiles;
    this.rooms = genData.rooms;
    this.stairs = genData.stairs;

    this.visited = Array(this.height).fill(null).map(() => Array(this.width).fill(false));
    this.visible = Array(this.height).fill(null).map(() => Array(this.width).fill(false));
    this.traps = [];
  }

  // 罠の配置
  spawnTraps(count) {
    const trapKeys = Object.keys(TRAP_TYPES);
    for (let i = 0; i < count; i++) {
      const p = this.getRandomFloorTile();
      if (p && !this.getTrapAt(p.x, p.y) && !(p.x === this.stairs.x && p.y === this.stairs.y)) {
        const type = TRAP_TYPES[trapKeys[Math.floor(Math.random() * trapKeys.length)]];
        this.traps.push(new Trap(p.x, p.y, type));
      }
    }
  }

  getTrapAt(x, y) {
    return this.traps.find(t => t.x === x && t.y === y) || null;
  }

  // マップ内側（外周の壁を除く）か。壁抜けモンスターの移動範囲
  isInBounds(x, y) {
    return x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1;
  }

  // タイル取得
  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return CONFIG.TILES.WALL;
    }
    return this.tiles[y][x];
  }

  // 床・通路・階段か
  isWalkable(x, y) {
    const tile = this.getTile(x, y);
    return tile === CONFIG.TILES.FLOOR || tile === CONFIG.TILES.CORRIDOR || tile === CONFIG.TILES.STAIRS_DOWN;
  }

  // SFCシレン準拠：角抜け判定（斜め移動時、隣接する2辺が壁なら抜けられない）
  canMoveDiagonal(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;

    // 斜め移動ではない場合は無関係
    if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) {
      return true;
    }

    // 目的マス自体が移動不可なら論外
    if (!this.isWalkable(toX, toY)) {
      return false;
    }

    // 隣接する2つの直交マスをチェック
    // どちらか一方でも壁なら、角に引っかかって進入不可（SFC風の角抜け禁止ルール）
    const side1 = this.isWalkable(fromX + dx, fromY);
    const side2 = this.isWalkable(fromX, fromY + dy);

    return side1 && side2;
  }

  // 座標がどの部屋に属しているか（通路ならnull）
  getRoomAt(x, y) {
    for (const r of this.rooms) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
        return r;
      }
    }
    return null;
  }

  // 視界（FoV: Field of View）計算
  computeVisibility(playerX, playerY, visionRadius = CONFIG.PLAYER_INIT.VISION_RADIUS) {
    // visible 配列をリセット
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.visible[y][x] = false;
      }
    }

    const currentRoom = this.getRoomAt(playerX, playerY);

    if (currentRoom) {
      // 部屋の中にいる場合：部屋の床＋周囲1マスの壁・出入口を全て視界内に
      const startX = Math.max(0, currentRoom.x - 1);
      const endX = Math.min(this.width - 1, currentRoom.x + currentRoom.w);
      const startY = Math.max(0, currentRoom.y - 1);
      const endY = Math.min(this.height - 1, currentRoom.y + currentRoom.h);

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          this.visible[y][x] = true;
          this.visited[y][x] = true;
        }
      }
    } else {
      // 通路にいる場合：プレイヤー周囲の近距離のみ可視
      for (let dy = -visionRadius; dy <= visionRadius; dy++) {
        for (let dx = -visionRadius; dx <= visionRadius; dx++) {
          const dist = Math.hypot(dx, dy);
          if (dist <= visionRadius) {
            const tx = playerX + dx;
            const ty = playerY + dy;
            if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
              // 簡易レイキャスト（壁で遮断）
              if (this.hasLineOfSight(playerX, playerY, tx, ty)) {
                this.visible[ty][tx] = true;
                this.visited[ty][tx] = true;
              }
            }
          }
        }
      }
    }

    // プレイヤーの足元は常に可視
    this.visible[playerY][playerX] = true;
    this.visited[playerY][playerX] = true;
  }

  // 直線視線チェック（Bresenham）
  hasLineOfSight(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (cx !== x1 || cy !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }

      // 終点以外の途中で壁にぶつかったら視線遮断
      if (cx !== x1 || cy !== y1) {
        if (!this.isWalkable(cx, cy)) {
          return false;
        }
      }
    }
    return true;
  }

  // ランダムな空床タイルを取得（配置用）
  getRandomFloorTile(targetRoom = null) {
    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      let x, y;
      if (targetRoom) {
        x = targetRoom.x + Math.floor(Math.random() * targetRoom.w);
        y = targetRoom.y + Math.floor(Math.random() * targetRoom.h);
      } else {
        const r = this.rooms[Math.floor(Math.random() * this.rooms.length)];
        x = r.x + Math.floor(Math.random() * r.w);
        y = r.y + Math.floor(Math.random() * r.h);
      }
      if (this.getTile(x, y) === CONFIG.TILES.FLOOR) {
        return { x, y };
      }
    }
    return null;
  }

  // 素振りなどで罠を発見する（正面の罠）
  revealTrap(x, y) {
    const trap = this.getTrapAt(x, y);
    if (trap && !trap.isRevealed) {
      trap.reveal();
      return trap;
    }
    return null;
  }
}
