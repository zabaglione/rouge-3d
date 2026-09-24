/**
 * Web Audio API によるプロシージャルサウンド＆BGMジェネレータ
 * 外部アセット不要で、高品質なレトロ調SEとBGMをリアルタイム合成
 */
import { fxClock } from './FxClock.js?v=20260924_11';

// 同じ音の繰り返しで単調にならないよう、鳴らすたびにピッチを揺らす幅（±割合）
const PITCH_VARIANCE = 0.06;

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.seGain = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmTimer = null;
    this.currentScale = [0, 3, 5, 7, 10]; // マイナーペンタトニック
    this.baseFreq = 110; // A2
    this.noiseBuffer = null;

    // SE は演出の順番待ち（敵の反撃など）に合わせて鳴らす
    for (const name of Object.getOwnPropertyNames(SoundEngine.prototype)) {
      if (!name.startsWith('play')) continue;
      const play = this[name].bind(this);
      this[name] = (...args) => fxClock.run(() => play(...args));
    }
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // 重なった打撃音が割れないよう、最後にコンプレッサーで音圧を揃える
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.compressor);

      // ノイズ系SE用の共有ホワイトノイズ（1秒分）
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.seGain = this.ctx.createGain();
      this.seGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.seGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);
    } catch (e) {
      console.warn('AudioContext not supported or blocked:', e);
    }
  }

  ensureContext() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // --- 合成ヘルパー ---

  // ピッチの揺らぎ係数
  vary(amount = PITCH_VARIANCE) {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  // 周波数が f0 → f1 へ変化する単音
  tone({ type = 'sine', f0, f1 = f0, dur, vol, delay = 0, attack = 0.003 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // フィルターを通したノイズ（打撃の芯・風切り・爆発などの質感）
  noise({ dur, vol, filter = 'lowpass', f0, f1 = f0, q = 1, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.setValueAtTime(q, t);
    bq.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bq);
    bq.connect(gain);
    gain.connect(this.seGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // --- SE 効果音 ---

  // 足音（石畳を踏む短いこすれ音。毎回わずかに変化させる）
  playStep() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const v = this.vary(0.15);
    this.tone({ type: 'triangle', f0: 95 * v, f1: 40, dur: 0.06, vol: 0.12 });
    this.noise({ dur: 0.04, vol: 0.06, filter: 'bandpass', f0: 1400 * v, q: 0.8 });
  }

  // 壁にぶつかった（鈍い「ゴツッ」）
  playBump() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    this.tone({ type: 'sine', f0: 120, f1: 45, dur: 0.1, vol: 0.35 });
    this.noise({ dur: 0.06, vol: 0.18, filter: 'lowpass', f0: 700, f1: 200 });
  }

  // 攻撃（素振り・空振りの風切り音）
  playSwing() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const v = this.vary();
    this.noise({ dur: 0.13, vol: 0.32, filter: 'bandpass', f0: 2600 * v, f1: 420, q: 1.6 });
    this.tone({ type: 'sine', f0: 520 * v, f1: 180, dur: 0.1, vol: 0.05 });
  }

  // 命中・打撃音（低い衝撃＋ザクッとした芯＋アタックのクリック）
  playHit(isCrit = false) {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const v = this.vary();

    // 風切り（振り下ろし）
    this.noise({ dur: 0.07, vol: 0.18, filter: 'bandpass', f0: 3000 * v, f1: 900, q: 1.4 });
    // 衝撃のクリック
    this.noise({ dur: 0.025, vol: 0.5, filter: 'highpass', f0: 2500, delay: 0.035 });
    // 肉を叩くような中域のザクッ
    this.noise({ dur: 0.12, vol: 0.45, filter: 'lowpass', f0: 2200 * v, f1: 300, delay: 0.035 });
    // 腹に響く低音
    this.tone({ type: 'sine', f0: 170 * v, f1: 42, dur: 0.18, vol: 0.55, delay: 0.035 });
    this.tone({ type: 'square', f0: 240 * v, f1: 60, dur: 0.08, vol: 0.12, delay: 0.035 });

    if (isCrit) {
      // 会心：金属が鳴る高音と、より重い衝撃を重ねる
      this.tone({ type: 'square', f0: 1760, f1: 1700, dur: 0.22, vol: 0.12, delay: 0.035 });
      this.tone({ type: 'triangle', f0: 2637, f1: 2600, dur: 0.3, vol: 0.1, delay: 0.05 });
      this.tone({ type: 'sine', f0: 110, f1: 30, dur: 0.35, vol: 0.6, delay: 0.035 });
      this.noise({ dur: 0.25, vol: 0.3, filter: 'lowpass', f0: 1200, f1: 80, delay: 0.05 });
    }
  }

  // 被ダメージ音（こちらが殴られた：鈍く重い音と、ざらついた痛み）
  playPlayerDamage() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const v = this.vary();
    this.noise({ dur: 0.1, vol: 0.45, filter: 'lowpass', f0: 1600 * v, f1: 200 });
    this.tone({ type: 'sine', f0: 130 * v, f1: 38, dur: 0.22, vol: 0.6 });
    this.tone({ type: 'square', f0: 180 * v, f1: 70, dur: 0.16, vol: 0.2, delay: 0.01 });
    this.tone({ type: 'sawtooth', f0: 90, f1: 55, dur: 0.12, vol: 0.12, delay: 0.02 });
  }

  // 敵撃破音（砕ける破裂音＋消えていく音）
  playEnemyDefeat() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const v = this.vary();
    this.noise({ dur: 0.3, vol: 0.4, filter: 'lowpass', f0: 3000, f1: 120 });
    this.tone({ type: 'sine', f0: 90, f1: 30, dur: 0.3, vol: 0.5 });
    [523.25, 392, 261.63, 196].forEach((freq, idx) => {
      this.tone({ type: 'square', f0: freq * v, f1: freq * v * 0.7, dur: 0.09, vol: 0.09, delay: 0.06 + idx * 0.045 });
    });
    // 経験値が入るキラッという音
    this.tone({ type: 'triangle', f0: 1318.5, dur: 0.18, vol: 0.1, delay: 0.26 });
    this.tone({ type: 'triangle', f0: 1975.5, dur: 0.22, vol: 0.08, delay: 0.31 });
  }

  // お金を拾った（チャリン）
  playCoin() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    this.tone({ type: 'square', f0: 987.77, dur: 0.07, vol: 0.12 });
    this.tone({ type: 'square', f0: 1318.51, dur: 0.28, vol: 0.12, delay: 0.07 });
  }

  // 爆発（地雷など）
  playExplosion() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    this.noise({ dur: 0.6, vol: 0.7, filter: 'lowpass', f0: 4000, f1: 60 });
    this.tone({ type: 'sine', f0: 100, f1: 25, dur: 0.55, vol: 0.8 });
    this.tone({ type: 'sawtooth', f0: 70, f1: 30, dur: 0.3, vol: 0.2 });
  }

  // アイテム取得
  playPickup() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [587.33, 880]; // D5, A5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);

      gain.gain.setValueAtTime(0.25, t + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.06 + 0.12);

      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.12);
    });
  }

  // アイテム使用・回復
  playHeal() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.07);

      gain.gain.setValueAtTime(0.2, t + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.07 + 0.2);

      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + idx * 0.07);
      osc.stop(t + idx * 0.07 + 0.2);
    });
  }

  // レベルアップ！
  playLevelUp() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    // 華やかな上昇ファンファーレ
    const notes = [392, 523.25, 659.25, 783.99, 1046.5]; // G4, C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(freq, t + idx * 0.09);

      const dur = idx === notes.length - 1 ? 0.5 : 0.15;
      gain.gain.setValueAtTime(0.25, t + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.09 + dur);

      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + idx * 0.09);
      osc.stop(t + idx * 0.09 + dur);
    });
  }

  // 階段を降りる
  playStairs() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [880, 783.99, 659.25, 523.25, 440];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0.2, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.08 + 0.18);

      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.18);
    });
  }

  // UI決定音 / メニュー選択音
  playMenuSelect() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.05);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // UIキャンセル / 閉じる音
  playMenuCancel() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.06);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // 魔法の杖・巻物発動音
  playMagic() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    
    // ピッチモジュレーション（アルペジオ風急激変化）
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(1200, t + 0.2);
    osc.frequency.linearRampToValueAtTime(600, t + 0.35);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // 投擲音
  playThrow() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // 罠発動音
  playTrap() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(450, t + 0.08);
    osc.frequency.linearRampToValueAtTime(100, t + 0.2);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // ゲームオーバー
  playGameOver() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [330, 311, 293, 277]; // 哀愁の下降半音階
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.2);

      gain.gain.setValueAtTime(0.3, t + idx * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.2 + 0.4);

      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + idx * 0.2);
      osc.stop(t + idx * 0.2 + 0.4);
    });
  }

  // --- BGM 自動生成＆再生ループ ---
  startBGM() {
    if (this.bgmPlaying) return;
    this.ensureContext();
    this.bgmPlaying = true;
    this.scheduleBGMStep();
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  scheduleBGMStep() {
    if (!this.bgmPlaying || !this.ctx || this.isMuted) {
      this.bgmTimer = setTimeout(() => this.scheduleBGMStep(), 500);
      return;
    }

    // ランダムな神秘的アルペジオノートの生成（マイナーペンタトニック）
    const semitones = this.currentScale[Math.floor(Math.random() * this.currentScale.length)];
    const octave = Math.random() > 0.6 ? 2 : 1;
    const freq = this.baseFreq * Math.pow(2, (semitones + (octave - 1) * 12) / 12);

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // 柔らかいFM/パッド調サウンド
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(t);
    osc.stop(t + 0.85);

    const nextTime = Math.random() * 250 + 200; // 200~450msの間隔
    this.bgmTimer = setTimeout(() => this.scheduleBGMStep(), nextTime);
  }
}

export const sound = new SoundEngine();
