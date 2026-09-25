/**
 * 演出（エフェクト・SE・モーション）の時間管理
 *
 * ゲームのロジックは1フレームで確定するが、演出まで同時に出すと
 * 「自分の攻撃」と「敵の反撃」が重なって何が起きたか分からない。
 * delayMs を設定している間に予約された演出は、その時間だけ遅らせて順番に再生する。
 * また、ヒットストップ（命中の瞬間に一瞬だけ時間を止める）もここで管理する。
 */
export const fxClock = {
  // これから予約する演出の遅延時間 (ms)。0 なら即時実行
  delayMs: 0,
  // 予約済みの演出 { wait: 残り待ち時間ms, fn }
  queue: [],
  // ヒットストップの残り時間 (ms)
  frozenMs: 0,

  // 演出を実行（遅延中なら予約）
  run(fn) {
    if (this.delayMs > 0) {
      this.queue.push({ wait: this.delayMs, fn });
    } else {
      fn();
    }
  },

  // 命中の瞬間に時間を止める（重なった場合は長い方を採用）
  hitStop(ms) {
    this.frozenMs = Math.max(this.frozenMs, ms);
  },

  isFrozen() {
    return this.frozenMs > 0;
  },

  // 演出の再生待ちがあるか（この間はプレイヤーの次の行動を受け付けない）
  isBusy() {
    return this.frozenMs > 0 || this.queue.length > 0;
  },

  update(deltaMs) {
    if (this.frozenMs > 0) {
      this.frozenMs -= deltaMs;
      return;
    }
    // 予約した演出の中でさらに予約されることはない（delayMs は常に 0）ので順に実行してよい
    const due = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.wait -= deltaMs;
      if (q.wait <= 0) {
        due.unshift(q);
        this.queue.splice(i, 1);
      }
    }
    for (const q of due) q.fn();
  },

  reset() {
    this.delayMs = 0;
    this.queue.length = 0;
    this.frozenMs = 0;
  },
};
