/**
 * NetHack（mklev.c）をリスペクトしたダンジョン生成
 *
 * 通常の階：
 *   1. 大きさの違う部屋を重ならないようランダムに置く（格子に縛らない）
 *   2. 部屋を左から順に並べ、隣同士 → 1つ飛ばし → まだ繋がっていない組 の順に通路で結ぶ（join）
 *   3. 通路は目的地へ向かいつつ確率的に曲がって進む（dig_corridor）。追加の通路は途中で途切れて行き止まりになる
 *   4. 出入口には扉を付ける（扉なし・開いた扉・閉じた扉・鍵のかかった扉）
 *   5. 深い階ほど暗い部屋が増える。噴水・流し台・祭壇・墓、壁のくぼみ（隠し部屋）、宝の動物園
 * 特殊な階：鉱山のような洞窟（浅い階）、大部屋（中層）、迷路（最深部の手前）
 */
import { CONFIG } from '../config.js?v=20260925_03';

// 生成中だけ使う地形の種類（最終的に CONFIG.TILES に変換する）
const K = { STONE: 0, WALL: 1, FLOOR: 2, CORR: 3, DOOR: 4 };

// 部屋の数と大きさ（NetHack は 80x21 に最大で十数部屋。こちらは 52x36）
const ROOM_TRIES = 600;
const ROOM_TARGET = { min: 8, max: 12 };
const ROOM_W = { min: 3, max: 12 };
const ROOM_H = { min: 2, max: 7 };

// 特殊な階の出現（階の範囲と確率）
const MINES_FLOORS = { from: 2, to: 4, chance: 0.35 };
const BIGROOM_FLOORS = { from: 10, to: 12, chance: 0.4 };
const MAZE_FLOORS = { from: 18, to: 19, chance: 0.6 };

// 迷路の階に置くもの（NetHack の makemaz：物が多く、ミノタウロスがうろつく）
export const MAZE_CONTENTS = {
  items: [11, 18], gold: [7, 12], traps: [7, 12], monsters: [7, 11], minotaurs: [0, 2],
};

// 部屋の地形の出現率（NetHack の mkfount / mksink / mkaltar / mkgrave と同程度）
const FEATURE_CHANCE = { fountain: 1 / 10, sink: 1 / 60, altar: 1 / 60, grave: 1 / 40 };

const rn2 = (n) => Math.floor(Math.random() * n);
const rnd = (n) => rn2(n) + 1;
const rnRange = (lo, hi) => lo + rn2(hi - lo + 1);

export class DungeonGenerator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  generate(floorNumber = 1) {
    this.floor = floorNumber;
    this.k = Array(this.height).fill(null).map(() => Array(this.width).fill(K.STONE));
    this.rooms = [];
    this.doors = [];
    this.features = [];
    this.niches = [];
    this.isMonsterHouse = false;

    let style = 'rooms';
    const inRange = (r) => floorNumber >= r.from && floorNumber <= r.to && Math.random() < r.chance;
    if (inRange(MAZE_FLOORS)) style = 'maze';
    else if (inRange(BIGROOM_FLOORS)) style = 'bigroom';
    else if (inRange(MINES_FLOORS)) style = 'mines';

    let result;
    if (style === 'maze') result = this.makeMaze();
    else if (style === 'mines') result = this.makeMines();
    else if (style === 'bigroom') result = this.makeBigRoom();
    else result = this.makeRoomsLevel();
    // 生成に失敗したら普通の階で作り直す
    if (!result) {
      style = 'rooms';
      this.k = Array(this.height).fill(null).map(() => Array(this.width).fill(K.STONE));
      this.rooms = []; this.doors = []; this.features = []; this.niches = [];
      result = this.makeRoomsLevel();
    }

    return {
      tiles: this.toTiles(),
      rooms: this.rooms,
      stairs: result.stairs,
      start: result.start,
      startRoom: result.startRoom || null,
      isMonsterHouse: this.isMonsterHouse,
      doors: this.doors,
      features: this.features,
      niches: this.niches,
      style,
    };
  }

  inMap(x, y) {
    return x > 0 && y > 0 && x < this.width - 1 && y < this.height - 1;
  }

  // --- 通常の階（部屋と通路） ---

  makeRoomsLevel() {
    const target = rnRange(ROOM_TARGET.min, ROOM_TARGET.max);
    for (let t = 0; t < ROOM_TRIES && this.rooms.length < target; t++) {
      // 小さめの部屋が多く、たまに大きな部屋
      const w = Math.random() < 0.25 ? rnRange(8, ROOM_W.max) : rnRange(ROOM_W.min, 8);
      const h = Math.random() < 0.25 ? rnRange(5, ROOM_H.max) : rnRange(ROOM_H.min, 5);
      const x = rnRange(2, this.width - w - 3);
      const y = rnRange(2, this.height - h - 3);
      if (this.rooms.some(r => x - 3 < r.x + r.w && x + w + 3 > r.x && y - 3 < r.y + r.h && y + h + 3 > r.y)) continue;
      this.addRoom(x, y, w, h);
    }
    if (this.rooms.length < 4) return null;

    // 左から順に並べる（NetHack の sort_rooms）
    this.rooms.sort((a, b) => a.x - b.x);
    this.rooms.forEach((r, i) => { r.id = i; });
    this.makeCorridors();

    // 開始部屋と階段部屋（なるべく遠く）
    const startRoom = this.rooms[rn2(this.rooms.length)];
    const far = this.rooms.filter(r => r !== startRoom)
      .sort((a, b) => Math.hypot(b.centerX - startRoom.centerX, b.centerY - startRoom.centerY) - Math.hypot(a.centerX - startRoom.centerX, a.centerY - startRoom.centerY));
    const stairsRoom = far[rn2(Math.min(3, far.length))];

    // 宝の動物園（NetHack の zoo。3階以降、開始部屋以外）
    if (this.floor >= 3 && Math.random() < 0.2) {
      const cand = this.rooms.filter(r => r !== startRoom && r !== stairsRoom && r.w * r.h >= 12);
      if (cand.length) {
        const zoo = cand[rn2(cand.length)];
        zoo.isMonsterHouse = true;
        this.isMonsterHouse = true;
      }
    }

    // 部屋の明るさ：深い階ほど暗い部屋が増える（NetHack の litstate_rnd）
    for (const r of this.rooms) {
      r.lit = r === startRoom || (rnd(1 + this.floor) < 11 && rn2(77) !== 0);
    }

    const stairs = this.randomSpot(stairsRoom, true);
    this.placeFeatures(stairs);
    this.makeNiches();

    return { stairs, start: this.randomSpot(startRoom), startRoom };
  }

  addRoom(x, y, w, h, lit = true) {
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        const inside = xx >= x && xx < x + w && yy >= y && yy < y + h;
        this.k[yy][xx] = inside ? K.FLOOR : K.WALL;
      }
    }
    const room = {
      x, y, w, h, lit,
      centerX: Math.floor(x + w / 2), centerY: Math.floor(y + h / 2),
      isMonsterHouse: false, doorCount: 0,
    };
    this.rooms.push(room);
    return room;
  }

  // 部屋の中の空いた床
  randomSpot(room, avoidFeatures = false) {
    for (let i = 0; i < 100; i++) {
      const x = room.x + rn2(room.w), y = room.y + rn2(room.h);
      if (avoidFeatures && this.features.some(f => f.x === x && f.y === y)) continue;
      return { x, y };
    }
    return { x: room.centerX, y: room.centerY };
  }

  // NetHack の makecorridors：順番に結び、繋がっていない組を結び、最後に行き止まりになりうる通路を足す
  makeCorridors() {
    const n = this.rooms.length;
    this.group = this.rooms.map((_, i) => i); // 連結成分（NetHack の smeq）
    const find = (i) => (this.group[i] === i ? i : (this.group[i] = find(this.group[i])));
    const tryJoin = (a, b, nxcor) => {
      if (this.join(a, b, nxcor)) {
        const ga = find(a), gb = find(b);
        if (ga !== gb) this.group[ga] = gb;
      }
    };
    for (let a = 0; a < n - 1; a++) {
      tryJoin(a, a + 1, false);
      if (!rn2(50)) break; // まれに途中で打ち切る（NetHack と同じく孤立は後で補う）
    }
    for (let a = 0; a < n - 2; a += 2) {
      if (find(a) !== find(a + 2)) tryJoin(a, a + 2, false);
    }
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (find(a) !== find(b)) tryJoin(a, b, false);
      }
    }
    // 追加の通路（途中で途切れると行き止まりになる）
    if (n > 2) {
      for (let i = rn2(Math.ceil(n / 2)) + 2; i > 0; i--) {
        const a = rn2(n);
        let b = rn2(n - 2);
        if (b >= a) b += 2;
        tryJoin(a, b, true);
      }
    }
    // それでも孤立した部屋があれば、直前の部屋と強引に結ぶ
    for (let a = 1; a < n; a++) {
      if (find(a) !== find(0)) {
        for (let b = 0; b < n && find(a) !== find(0); b++) {
          if (find(b) === find(0)) tryJoin(a, b, false);
        }
      }
    }
  }

  // 2部屋を結ぶ：向かい合う壁に扉の位置を決め、通路を掘る
  join(ai, bi, nxcor) {
    const c = this.rooms[ai], t = this.rooms[bi];
    let dd, tt, dx = 0, dy = 0;
    if (t.x > c.x + c.w - 1) {           // 相手が右
      dx = 1;
      dd = this.findDoorPos(c.x + c.w, c.y, c.x + c.w, c.y + c.h - 1);
      tt = this.findDoorPos(t.x - 1, t.y, t.x - 1, t.y + t.h - 1);
    } else if (t.y + t.h - 1 < c.y) {    // 相手が上
      dy = -1;
      dd = this.findDoorPos(c.x, c.y - 1, c.x + c.w - 1, c.y - 1);
      tt = this.findDoorPos(t.x, t.y + t.h, t.x + t.w - 1, t.y + t.h);
    } else if (t.x + t.w - 1 < c.x) {    // 相手が左
      dx = -1;
      dd = this.findDoorPos(c.x - 1, c.y, c.x - 1, c.y + c.h - 1);
      tt = this.findDoorPos(t.x + t.w, t.y, t.x + t.w, t.y + t.h - 1);
    } else {                              // 相手が下
      dy = 1;
      dd = this.findDoorPos(c.x, c.y + c.h, c.x + c.w - 1, c.y + c.h);
      tt = this.findDoorPos(t.x, t.y - 1, t.x + t.w - 1, t.y - 1);
    }
    const org = { x: dd.x + dx, y: dd.y + dy };
    const dest = { x: tt.x - dx, y: tt.y - dy };
    if (!this.inMap(org.x, org.y) || !this.inMap(dest.x, dest.y)) return false;
    if (this.k[org.y][org.x] !== K.STONE && this.k[org.y][org.x] !== K.CORR) return false;
    const res = this.digCorridor(org, dest, nxcor);
    if (res === 'fail') return false;
    // 扉を付ける（途中で途切れた追加通路は、掘り始めた部屋の側にだけ扉があり行き止まりになる）
    if (this.okDoor(dd.x, dd.y) || !nxcor) this.addDoor(dd.x, dd.y, c);
    if (res === 'deadend') return false;
    this.addDoor(tt.x, tt.y, t);
    return true;
  }

  // 壁の上で扉を置ける位置（隣に扉がない場所を優先）
  findDoorPos(x0, y0, x1, y1) {
    const cands = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) cands.push({ x, y });
    }
    const ok = cands.filter(p => this.okDoor(p.x, p.y));
    const pool = ok.length ? ok : cands;
    return pool[rn2(pool.length)];
  }

  okDoor(x, y) {
    if (this.k[y][x] !== K.WALL && this.k[y][x] !== K.DOOR) return false;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const kk = this.k[y + ddy] && this.k[y + ddy][x + ddx];
      if (kk === K.DOOR) return false;
    }
    return true;
  }

  // NetHack の dosdoor：2/3 は扉のない出入口、残りは開いた扉・鍵付き・閉じた扉
  addDoor(x, y, room) {
    if (this.k[y][x] === K.DOOR) return;
    this.k[y][x] = K.DOOR;
    let state = 'none';
    if (!rn2(3)) {
      if (!rn2(5)) state = 'open';
      else if (!rn2(6)) state = 'locked';
      else state = 'closed';
    } else if (!rn2(12)) {
      state = 'broken';
    }
    // 浅い階では鍵付きの扉を減らす
    if (state === 'locked' && this.floor <= 2 && rn2(2)) state = 'closed';
    this.doors.push({ x, y, state });
    if (room) room.doorCount++;
  }

  // NetHack の dig_corridor：目的地へ向かいながら、ときどき向きを変えて掘り進む
  // 戻り値: 'ok' = 目的地まで繋がった, 'deadend' = 追加通路が途中で途切れた, 'fail' = 掘れなかった
  digCorridor(org, dest, nxcor) {
    let xx = org.x, yy = org.y;
    const tx = dest.x, ty = dest.y;
    let dx = 0, dy = 0;
    if (tx > xx) dx = 1;
    else if (ty > yy) dy = 1;
    else if (tx < xx) dx = -1;
    else dy = -1;
    xx -= dx;
    yy -= dy;
    let cct = 0;
    const dug = [];
    if (xx + dx === tx && yy + dy === ty && org.x === tx && org.y === ty) {
      if (this.k[ty][tx] === K.STONE) this.k[ty][tx] = K.CORR;
      return 'ok';
    }
    const passable = (x, y) => this.inMap(x, y) && (this.k[y][x] === K.STONE || this.k[y][x] === K.CORR);

    while (xx !== tx || yy !== ty) {
      // 追加の通路は途中で途切れることがある（行き止まり）
      if (cct++ > 500) return this.undig(dug);
      if (nxcor && !rn2(35)) return dug.length > 2 ? 'deadend' : this.undig(dug);
      xx += dx;
      yy += dy;
      if (!this.inMap(xx, yy)) return this.undig(dug);
      if (this.k[yy][xx] === K.STONE) {
        this.k[yy][xx] = K.CORR;
        dug.push([xx, yy]);
      } else if (this.k[yy][xx] !== K.CORR) {
        return this.undig(dug);
      }

      let dix = Math.abs(xx - tx);
      let diy = Math.abs(yy - ty);
      if (dix > diy && diy && !rn2(dix - diy + 1)) dix = 0;
      else if (diy > dix && dix && !rn2(diy - dix + 1)) diy = 0;

      // 向きを変える必要があるか
      if (dy && dix > diy) {
        const ddx = xx > tx ? -1 : 1;
        if (passable(xx + ddx, yy)) { dx = ddx; dy = 0; continue; }
      } else if (dx && diy > dix) {
        const ddy = yy > ty ? -1 : 1;
        if (passable(xx, yy + ddy)) { dy = ddy; dx = 0; continue; }
      }
      // まっすぐ進めるか
      if (passable(xx + dx, yy + dy)) continue;
      // 曲がる
      if (dx) { dx = 0; dy = ty < yy ? -1 : 1; } else { dy = 0; dx = tx < xx ? -1 : 1; }
      if (passable(xx + dx, yy + dy)) continue;
      dy = -dy;
      dx = -dx;
    }
    return 'ok';
  }

  // 失敗した通路を埋め戻す（ただし追加通路の行き止まりは残す）
  undig(dug) {
    for (const [x, y] of dug) this.k[y][x] = K.STONE;
    return 'fail';
  }

  // 噴水・流し台・祭壇・墓
  placeFeatures(stairs) {
    const used = new Set([`${stairs.x},${stairs.y}`]);
    const put = (room, type) => {
      for (let i = 0; i < 20; i++) {
        // 部屋の縁は扉の前をふさぎやすいので避ける
        const x = room.x + (room.w > 2 ? 1 + rn2(room.w - 2) : rn2(room.w));
        const y = room.y + (room.h > 2 ? 1 + rn2(room.h - 2) : rn2(room.h));
        if (used.has(`${x},${y}`)) continue;
        used.add(`${x},${y}`);
        this.features.push({ x, y, type, room });
        return;
      }
    };
    for (const r of this.rooms) {
      if (r.isMonsterHouse) continue;
      if (Math.random() < FEATURE_CHANCE.fountain) put(r, 'fountain');
      if (Math.random() < FEATURE_CHANCE.sink) put(r, 'sink');
      if (Math.random() < FEATURE_CHANCE.altar) put(r, 'altar');
      if (Math.random() < FEATURE_CHANCE.grave + this.floor * 0.004) put(r, 'grave');
    }
  }

  // 壁のくぼみ（NetHack の makeniche）：部屋の上の壁の奥に1マスの小部屋。扉の奥に宝が眠る
  makeNiches() {
    const count = rn2(3);
    for (let i = 0, tries = 0; i < count && tries < 30; tries++) {
      const r = this.rooms[rn2(this.rooms.length)];
      if (r.isMonsterHouse) continue;
      const x = r.x + rn2(r.w);
      const wy = r.y - 1, ny = r.y - 2;
      if (!this.inMap(x, ny) || ny < 1) continue;
      if (this.k[wy][x] !== K.WALL || !this.okDoor(x, wy)) continue;
      let clear = true;
      for (let yy = ny - 1; yy <= ny; yy++) {
        for (let xx = x - 1; xx <= x + 1; xx++) {
          if (!this.inMap(xx, yy) || this.k[yy][xx] !== K.STONE) clear = false;
        }
      }
      if (!clear) continue;
      this.k[ny][x] = K.CORR;
      this.k[wy][x] = K.DOOR;
      this.doors.push({ x, y: wy, state: rn2(3) ? 'closed' : 'locked' });
      this.niches.push({ x, y: ny });
      i++;
    }
  }

  // --- 鉱山のような洞窟（セルオートマトン） ---

  makeMines() {
    const W = this.width, H = this.height;
    let g = Array(H).fill(null).map((_, y) => Array(W).fill(0).map((__, x) =>
      (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 1 : (Math.random() < 0.42 ? 1 : 0)));
    for (let it = 0; it < 5; it++) {
      const n = g.map(row => row.slice());
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) walls += g[y + dy][x + dx];
          n[y][x] = walls >= 5 || (it < 3 && walls <= 1) ? 1 : 0;
        }
      }
      g = n;
    }
    // 分断された空洞をトンネルでつなぎ、小さすぎる空洞は埋める
    const regions = this.regions((x, y) => g[y][x] === 0).filter(r => r.length >= 12);
    if (!regions.length) return null;
    regions.sort((a, b) => b.length - a.length);
    const main = regions[0].slice();
    for (const [x, y] of main) this.k[y][x] = K.FLOOR;
    for (const r of regions.slice(1)) {
      for (const [x, y] of r) this.k[y][x] = K.FLOOR;
      // 最も近い本坑の地点へ曲がった坑道を掘る
      const [ax, ay] = r[rn2(r.length)];
      let best = main[0], bd = Infinity;
      for (const c of main) {
        const dd = Math.abs(c[0] - ax) + Math.abs(c[1] - ay);
        if (dd < bd) { bd = dd; best = c; }
      }
      let x = ax, y = ay;
      while (x !== best[0] || y !== best[1]) {
        if (x !== best[0] && (y === best[1] || rn2(2))) x += Math.sign(best[0] - x);
        else y += Math.sign(best[1] - y);
        this.k[y][x] = K.FLOOR;
      }
      main.push(...r);
    }
    const region = main;
    if (region.length < 300) return null;
    this.wallAround();
    // 開始地点から最も遠い場所に階段
    const start = region[rn2(region.length)];
    const dist = this.bfs(start[0], start[1]);
    let best = start, bestD = -1;
    for (const [x, y] of region) {
      const d = dist[y][x];
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    return { start: { x: start[0], y: start[1] }, stairs: { x: best[0], y: best[1] } };
  }

  // --- 大部屋 ---

  makeBigRoom() {
    const w = this.width - 10, h = this.height - 12;
    const room = this.addRoom(5, 6, w, h, true);
    room.id = 0;
    // 所々に柱を立てて単調にしない
    for (let y = room.y + 3; y < room.y + room.h - 3; y += 5) {
      for (let x = room.x + 4; x < room.x + room.w - 4; x += 8) {
        if (rn2(3)) this.k[y][x] = K.WALL;
      }
    }
    const start = { x: room.x + 1, y: room.y + rn2(room.h) };
    let stairs = { x: room.x + room.w - 2, y: room.y + rn2(room.h) };
    if (this.k[start.y][start.x] !== K.FLOOR) start.x++;
    if (this.k[stairs.y][stairs.x] !== K.FLOOR) stairs.x--;
    if (rn2(2)) this.features.push({ x: room.centerX, y: room.centerY, type: 'fountain', room });
    return { start, stairs, startRoom: room };
  }

  // --- 迷路（NetHack の makemaz と同じく、輪のない1マス幅の迷路） ---

  makeMaze() {
    const W = this.width, H = this.height;
    const cw = Math.floor((W - 1) / 2), ch = Math.floor((H - 1) / 2);
    const seen = Array(ch).fill(null).map(() => Array(cw).fill(false));
    const stack = [[rn2(cw), rn2(ch)]];
    seen[stack[0][1]][stack[0][0]] = true;
    this.k[stack[0][1] * 2 + 1][stack[0][0] * 2 + 1] = K.FLOOR;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        return nx >= 0 && ny >= 0 && nx < cw && ny < ch && !seen[ny][nx];
      });
      if (!dirs.length) { stack.pop(); continue; }
      const [dx, dy] = dirs[rn2(dirs.length)];
      const nx = cx + dx, ny = cy + dy;
      seen[ny][nx] = true;
      this.k[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = K.FLOOR;
      this.k[ny * 2 + 1][nx * 2 + 1] = K.FLOOR;
      stack.push([nx, ny]);
    }
    this.wallAround();
    // 上り（到着地点）・下り階段はどちらも迷路のランダムな位置（NetHack の mazexy）
    const start = this.mazeXY();
    let stairs = this.mazeXY();
    for (let i = 0; i < 20 && stairs.x === start.x && stairs.y === start.y; i++) stairs = this.mazeXY();
    return { start, stairs };
  }

  // 迷路の通路上のランダムな位置
  mazeXY() {
    for (;;) {
      const x = 1 + rn2(this.width - 2), y = 1 + rn2(this.height - 2);
      if (this.k[y][x] === K.FLOOR) return { x, y };
    }
  }

  // --- 補助 ---

  // 歩ける場所の周りを壁にする（洞窟用）
  wallAround() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.k[y][x] !== K.STONE) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const r = this.k[y + dy] && this.k[y + dy][x + dx];
            if (r === K.CORR || r === K.FLOOR) this.k[y][x] = K.WALL;
          }
        }
      }
    }
  }

  // 4方向につながった領域の一覧
  regions(open) {
    const W = this.width, H = this.height;
    const seen = Array(H).fill(null).map(() => Array(W).fill(false));
    const out = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (seen[y][x] || !open(x, y)) continue;
        const cells = [];
        const q = [[x, y]];
        seen[y][x] = true;
        while (q.length) {
          const [cx, cy] = q.pop();
          cells.push([cx, cy]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && !seen[ny][nx] && open(nx, ny)) {
              seen[ny][nx] = true;
              q.push([nx, ny]);
            }
          }
        }
        out.push(cells);
      }
    }
    return out;
  }

  bfs(sx, sy) {
    const W = this.width, H = this.height;
    const d = Array(H).fill(null).map(() => Array(W).fill(Infinity));
    d[sy][sx] = 0;
    const q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (d[ny] && d[ny][nx] === Infinity && (this.k[ny][nx] === K.CORR || this.k[ny][nx] === K.FLOOR || this.k[ny][nx] === K.DOOR)) {
          d[ny][nx] = d[y][x] + 1;
          q.push([nx, ny]);
        }
      }
    }
    return d;
  }

  toTiles() {
    const T = CONFIG.TILES;
    return this.k.map(row => row.map(v => (
      v === K.FLOOR ? T.FLOOR : v === K.CORR ? T.CORRIDOR : v === K.DOOR ? T.DOOR : T.WALL
    )));
  }
}
