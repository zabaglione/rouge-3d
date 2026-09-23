/**
 * クラシック『ローグ』×『シレン』風 3x3 グリッド分割プロシージャルダンジョン生成
 */
import { CONFIG } from '../config.js?v=20260924_7';

export class DungeonGenerator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = Array(height).fill(null).map(() => Array(width).fill(CONFIG.TILES.WALL));
    this.rooms = [];
    this.corridors = [];
    this.stairs = null;
    this.isMonsterHouse = false;
  }

  generate(floorNumber = 1) {
    // マップ初期化
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.tiles[y][x] = CONFIG.TILES.WALL;
      }
    }
    this.rooms = [];
    this.corridors = [];
    this.isMonsterHouse = false;

    // 3x3 のグリッド分割
    const gridCols = 3;
    const gridRows = 3;
    const cellW = Math.floor(this.width / gridCols);
    const cellH = Math.floor(this.height / gridRows);

    const grid = Array(gridRows).fill(null).map(() => Array(gridCols).fill(null));

    // 各セルに部屋を生成
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        // 余白を設けて部屋サイズ決定
        const margin = 2;
        const maxRoomW = cellW - margin * 2;
        const maxRoomH = cellH - margin * 2;

        const roomW = Math.floor(Math.random() * (maxRoomW - 6)) + 6;
        const roomH = Math.floor(Math.random() * (maxRoomH - 4)) + 4;

        const rx = gx * cellW + margin + Math.floor(Math.random() * (maxRoomW - roomW));
        const ry = gy * cellH + margin + Math.floor(Math.random() * (maxRoomH - roomH));

        const room = {
          id: gy * gridCols + gx,
          gx, gy,
          x: rx,
          y: ry,
          w: roomW,
          h: roomH,
          centerX: Math.floor(rx + roomW / 2),
          centerY: Math.floor(ry + roomH / 2),
          isMonsterHouse: false,
        };

        // 部屋の床を掘る
        for (let y = ry; y < ry + roomH; y++) {
          for (let x = rx; x < rx + roomW; x++) {
            this.tiles[y][x] = CONFIG.TILES.FLOOR;
          }
        }

        grid[gy][gx] = room;
        this.rooms.push(room);
      }
    }

    // 部屋同士を通路で接続（隣接する部屋同士をランダムに接続、孤立しないようにする）
    const connections = [];
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        // 右の部屋と接続
        if (gx < gridCols - 1) {
          connections.push({ r1: grid[gy][gx], r2: grid[gy][gx + 1] });
        }
        // 下の部屋と接続
        if (gy < gridRows - 1) {
          connections.push({ r1: grid[gy][gx], r2: grid[gy + 1][gx] });
        }
      }
    }

    // 通路を掘る（全接続、または一定間引きで環状網）
    for (const conn of connections) {
      this.carveCorridor(conn.r1, conn.r2);
    }

    // 開始部屋と階段部屋を別々にランダム選択（毎回同じ位置だと探索にならない）
    const pickRoom = (exclude) => {
      const pool = this.rooms.filter(r => !exclude.includes(r));
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const startRoom = pickRoom([]);
    const stairsRoom = pickRoom([startRoom]);

    // モンスターハウス抽選（3F以降、確率20%）。開始部屋は除外
    if (floorNumber >= 3 && Math.random() < 0.2) {
      const mhRoom = pickRoom([startRoom]);
      mhRoom.isMonsterHouse = true;
      this.isMonsterHouse = true;
    }

    this.stairs = {
      x: stairsRoom.x + Math.floor(stairsRoom.w / 2),
      y: stairsRoom.y + Math.floor(stairsRoom.h / 2),
    };
    this.tiles[this.stairs.y][this.stairs.x] = CONFIG.TILES.STAIRS_DOWN;

    return {
      tiles: this.tiles,
      rooms: this.rooms,
      stairs: this.stairs,
      startRoom: startRoom,
      isMonsterHouse: this.isMonsterHouse,
    };
  }

  // 2部屋間のクランク状通路を掘る
  carveCorridor(r1, r2) {
    let x1 = r1.centerX;
    let y1 = r1.centerY;
    let x2 = r2.centerX;
    let y2 = r2.centerY;

    // 部屋の外枠から通路をスタートさせる
    // 中間地点を経由するL字またはクランク通路
    const horizontalFirst = Math.random() > 0.5;

    if (horizontalFirst) {
      this.digLineH(x1, x2, y1);
      this.digLineV(y1, y2, x2);
    } else {
      this.digLineV(y1, y2, x1);
      this.digLineH(x1, x2, y2);
    }
  }

  digLineH(x1, x2, y) {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
      if (x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1) {
        if (this.tiles[y][x] === CONFIG.TILES.WALL) {
          this.tiles[y][x] = CONFIG.TILES.CORRIDOR;
        }
      }
    }
  }

  digLineV(y1, y2, x) {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
      if (x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1) {
        if (this.tiles[y][x] === CONFIG.TILES.WALL) {
          this.tiles[y][x] = CONFIG.TILES.CORRIDOR;
        }
      }
    }
  }
}
