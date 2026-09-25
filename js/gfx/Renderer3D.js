/**
 * WebGPU 3D レンダラー
 *
 * - ダンジョン：手続きシェーダーの石畳・石積み壁、松明の動的光源、視界（探索済みは青い記憶色）
 * - プレイヤー：部品を組み合わせた騎士（歩行・攻撃・被弾・転倒のアニメーション、揺れるマント）
 * - 敵：NetHack の記号を立体化（SDF レイマーチング）
 * - 演出：加算合成のパーティクル、HDR＋ブルーム、色収差、ビネット、カメラワーク
 * - 文字（ダメージ数値・階層名・HPバー）は上に重ねた 2D キャンバスに描く
 */
import { CONFIG } from '../config.js?v=20260925_06';
import { ATTACK_ANIM_MS, DAMAGE_ANIM_MS } from '../entities/Entity.js?v=20260925_06';
import { GAME_STATES } from '../engine/Game.js?v=20260925_06';
import { FX } from '../engine/Animation.js?v=20260925_06';
import {
  mat4, multiply, perspective, lookAt, invert, compose, transformPoint, lerp, lerpAngle, damp, hexToRgb, clamp,
} from './math.js?v=20260925_06';
import { MeshBuilder, VERTEX_STRIDE, VERTEX_FLOATS } from './geometry.js?v=20260925_06';
import {
  MAX_LIGHTS, MESH_SHADER, GLYPH_SHADER, FX_SHADER, BLOOM_DOWN_SHADER, BLOOM_UP_SHADER, COMPOSITE_SHADER,
} from './shaders.js?v=20260925_06';
import { buildWorld } from './world.js?v=20260925_06';
import {
  buildPlayerParts, buildSword, buildShield, buildItemModel, buildChest, writeCape, HIP_Y, SHOULDER,
  buildDoorLeaf, buildBrokenDoor, buildFountain, buildAltar, buildSink, buildGrave,
} from './models.js?v=20260925_06';
import { buildGlyphAtlas, MONSTER_GLYPHS, TRAP_GLYPH } from './glyphs.js?v=20260925_06';

const HDR_FORMAT = 'rgba16float';
const DEPTH_FORMAT = 'depth24plus';
const SAMPLES_DEFAULT = 4;
const DRAW_SLOT = 256;           // 1描画あたりの uniform の区画（動的オフセットの境界）
const DRAW_FLOATS = 44;          // Draw 構造体の float 数（176 byte）
const MAX_DRAWS = 1024;
const MAX_FX = 4096;
const FX_FLOATS = 16;
const FRAME_FLOATS = 4 * 4 + 7 * 4 + MAX_LIGHTS * 8;
const BLOOM_LEVELS = 5;

// カメラ：見下ろし角・距離・画角
const CAM_PITCH = 0.98;          // 約56度
const CAM_DIST = 8.8;
const CAM_FOV = 0.66;
// プレイヤーの踏み込み・被弾ののけぞり（マス）
const LUNGE = 0.32;
const RECOIL = 0.16;
// 視界テクスチャの変化の速さ（1秒あたり）
const FOG_SPEED = 6;
// 霧の色と環境光
const FOG_COLOR = [0.01, 0.012, 0.02];
const AMBIENT = [0.05, 0.055, 0.075];

// 文字表示用のフォント
const TEXT_FONT = `'Outfit', 'Inter', 'Hiragino Sans', 'Noto Sans JP', sans-serif`;

export class Renderer3D {
  static async create(canvas, overlayCanvas) {
    if (!navigator.gpu) throw new Error('このブラウザは WebGPU に対応していません。');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU のアダプターを取得できませんでした。');
    const device = await adapter.requestDevice();
    const r = new Renderer3D(canvas, overlayCanvas, device);
    r.init();
    return r;
  }

  constructor(canvas, overlayCanvas, device) {
    this.canvas = canvas;
    this.overlay = overlayCanvas;
    this.ctx = overlayCanvas.getContext('2d');
    this.device = device;
    // 検証用：?readback を付けると、描画結果を読み戻して 2D キャンバスに写す（画面表示できない環境向け）
    this.readback = new URLSearchParams(location.search).has('readback');
    this.gpu = this.readback ? null : canvas.getContext('webgpu');
    this.format = this.readback ? 'rgba8unorm' : navigator.gpu.getPreferredCanvasFormat();
    // 検証モードは速度優先（アンチエイリアスなし・解像度を下げる）
    this.samples = this.readback ? 1 : SAMPLES_DEFAULT;

    this.width = 1;
    this.height = 1;
    this.viewInsetTop = 0;
    this.viewInsetBottom = 0;
    this.snapCamera = true;
    this.time = 0;

    this.floorKey = null;
    this.world = null;
    this.itemMeshes = new Map();
    this.swordMeshes = new Map();
    this.shieldMeshes = new Map();

    // カメラ状態
    this.camTarget = [0, 0, 0];
    this.camYaw = 0;
    this.viewProj = mat4();
    this.camPos = [0, 0, 0];
    this.camRight = [1, 0, 0];
    this.camUp = [0, 1, 0];

    // プレイヤーのアニメーション状態
    this.anim = { yaw: 0, walk: 0, speed: 0, lastX: 0, lastZ: 0, fall: 0, capeLift: 0 };
    // 敵の向き・アニメーション（個体ごと）
    this.monsterAnim = new WeakMap();

    device.lost.then((info) => {
      console.error('WebGPU device lost:', info.message);
      this.lost = true;
    });
  }

  // --- 初期化 ---

  init() {
    const d = this.device;
    if (this.gpu) this.gpu.configure({ device: d, format: this.format, alphaMode: 'opaque' });

    this.sampler = d.createSampler({
      magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    });

    // 共有 uniform
    this.frameBuf = d.createBuffer({ size: FRAME_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameData = new Float32Array(FRAME_FLOATS);
    this.drawBuf = d.createBuffer({ size: DRAW_SLOT * MAX_DRAWS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.drawData = new Float32Array((DRAW_SLOT / 4) * MAX_DRAWS);
    this.fxBuf = d.createBuffer({ size: FX_FLOATS * 4 * MAX_FX, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.fxData = new Float32Array(FX_FLOATS * MAX_FX);

    // 立体文字の距離場アトラス
    const chars = [...new Set([...Object.values(MONSTER_GLYPHS), TRAP_GLYPH])];
    const atlas = buildGlyphAtlas(chars);
    this.glyphRects = atlas.rects;
    this.glyphTex = d.createTexture({
      size: [atlas.width, atlas.height], format: 'r16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    d.queue.writeTexture({ texture: this.glyphTex }, atlas.data, { bytesPerRow: atlas.width * 2 }, [atlas.width, atlas.height]);

    // 視界テクスチャ（マップと同じ大きさ）
    this.fogW = CONFIG.MAP_WIDTH;
    this.fogH = CONFIG.MAP_HEIGHT;
    this.fogTex = d.createTexture({
      size: [this.fogW, this.fogH], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.fogVis = new Float32Array(this.fogW * this.fogH);
    this.fogMem = new Float32Array(this.fogW * this.fogH);
    this.fogBytes = new Uint8Array(this.fogW * this.fogH * 4);

    // バインドグループのレイアウト
    this.frameBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this.drawBGL = d.createBindGroupLayout({
      entries: [{
        binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: DRAW_FLOATS * 4 },
      }],
    });
    this.frameBG = d.createBindGroup({
      layout: this.frameBGL,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuf } },
        { binding: 1, resource: this.fogTex.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.glyphTex.createView() },
      ],
    });
    this.drawBG = d.createBindGroup({
      layout: this.drawBGL,
      entries: [{ binding: 0, resource: { buffer: this.drawBuf, size: DRAW_FLOATS * 4 } }],
    });

    this.createPipelines();
    this.createModels();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  shader(code, label) {
    const m = this.device.createShaderModule({ code, label });
    m.getCompilationInfo().then((info) => {
      for (const msg of info.messages) {
        if (msg.type === 'error') console.error(`[${label}] ${msg.lineNum}:${msg.linePos} ${msg.message}`);
      }
    });
    return m;
  }

  createPipelines() {
    const d = this.device;
    const layout = d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL, this.drawBGL] });
    const meshVB = [{
      arrayStride: VERTEX_STRIDE,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x4' },
        { shaderLocation: 3, offset: 40, format: 'float32x4' },
      ],
    }];
    const depthOn = { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' };

    const meshModule = this.shader(MESH_SHADER, 'mesh');
    this.meshPipeline = d.createRenderPipeline({
      layout,
      vertex: { module: meshModule, entryPoint: 'vs', buffers: meshVB },
      fragment: { module: meshModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn,
      multisample: { count: this.samples },
    });

    const glyphModule = this.shader(GLYPH_SHADER, 'glyph');
    this.glyphPipeline = d.createRenderPipeline({
      layout,
      vertex: { module: glyphModule, entryPoint: 'vs', buffers: meshVB },
      fragment: { module: glyphModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depthOn,
      multisample: { count: this.samples },
    });

    const fxModule = this.shader(FX_SHADER, 'fx');
    const add = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    this.fxPipeline = d.createRenderPipeline({
      layout,
      vertex: {
        module: fxModule, entryPoint: 'vs',
        buffers: [{
          arrayStride: FX_FLOATS * 4, stepMode: 'instance',
          attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })),
        }],
      },
      fragment: { module: fxModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT, blend: add }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less' },
      multisample: { count: this.samples },
    });

    // ポストエフェクト
    const postBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.postBGL = postBGL;
    const postLayout = d.createPipelineLayout({ bindGroupLayouts: [postBGL] });
    const down = this.shader(BLOOM_DOWN_SHADER, 'bloomDown');
    const up = this.shader(BLOOM_UP_SHADER, 'bloomUp');
    this.bloomDownPipeline = d.createRenderPipeline({
      layout: postLayout,
      vertex: { module: down, entryPoint: 'vs' },
      fragment: { module: down, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
    });
    this.bloomUpPipeline = d.createRenderPipeline({
      layout: postLayout,
      vertex: { module: up, entryPoint: 'vs' },
      fragment: { module: up, entryPoint: 'fs', targets: [{ format: HDR_FORMAT, blend: add }] },
    });

    this.compBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const comp = this.shader(COMPOSITE_SHADER, 'composite');
    this.compositePipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.compBGL] }),
      vertex: { module: comp, entryPoint: 'vs' },
      fragment: { module: comp, entryPoint: 'fs', targets: [{ format: this.format }] },
    });
    this.postBuf = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.postData = new Float32Array(16);
  }

  mesh(data) {
    const buf = this.device.createBuffer({ size: Math.max(64, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buf, 0, data);
    return { buf, count: data.length / VERTEX_FLOATS };
  }

  createModels() {
    const parts = buildPlayerParts();
    this.playerBody = this.mesh(parts.body);
    this.playerLeg = this.mesh(parts.leg);
    this.playerArm = this.mesh(parts.arm);
    // マントは毎フレーム書き換える
    this.capeBuilder = new MeshBuilder();
    writeCape(this.capeBuilder, 0, 0, 0);
    const capeData = this.capeBuilder.toArray();
    this.cape = { buf: this.device.createBuffer({ size: capeData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), count: capeData.length / VERTEX_FLOATS };
    this.chest = this.mesh(buildChest());
    this.doorLeaf = this.mesh(buildDoorLeaf(false));
    this.doorLeafLocked = this.mesh(buildDoorLeaf(true));
    this.brokenDoor = this.mesh(buildBrokenDoor());
    this.featureMeshes = {
      fountain: this.mesh(buildFountain()),
      altar: this.mesh(buildAltar()),
      sink: this.mesh(buildSink()),
      grave: this.mesh(buildGrave()),
    };
    this.doorAnim = new WeakMap();
    this.arrow = this.mesh(buildItemModel({ type: 'arrow', id: 'arr_wood', color: '#ffffff' }));
    // 立体文字の入れ物（単位の箱）
    const box = new MeshBuilder();
    box.box(1.1, 1.1, 0.3);
    this.glyphBox = this.mesh(box.toArray());
  }

  resize() {
    const dpr = this.readback ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    const parent = this.canvas.parentElement;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    const pw = Math.max(1, Math.floor(this.width * dpr));
    const ph = Math.max(1, Math.floor(this.height * dpr));
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.overlay.width = pw;
    this.overlay.height = ph;
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.createTargets(pw, ph);
  }

  createTargets(w, h) {
    const d = this.device;
    for (const t of [this.msaaTex, this.depthTex, this.sceneTex, ...(this.bloomTex || [])]) {
      if (t) t.destroy();
    }
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.msaaTex = d.createTexture({ size: [w, h], format: HDR_FORMAT, sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthTex = d.createTexture({ size: [w, h], format: DEPTH_FORMAT, sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.sceneTex = d.createTexture({ size: [w, h], format: HDR_FORMAT, usage });
    if (this.readback) {
      if (this.readbackTex) this.readbackTex.destroy();
      this.readbackTex = d.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      this.readbackRow = Math.ceil(w * 4 / 256) * 256;
      this.readbackBuf = d.createBuffer({ size: this.readbackRow * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      this.readbackBusy = false;
    }

    this.bloomTex = [];
    this.bloomDownBG = [];
    this.bloomUpBG = [];
    let bw = w, bh = h;
    const mkParam = (vals) => {
      const buf = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(buf, 0, new Float32Array(vals));
      return buf;
    };
    const mkBG = (tex, buf) => d.createBindGroup({
      layout: this.postBGL,
      entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: this.sampler }, { binding: 2, resource: { buffer: buf } }],
    });
    let srcTex = this.sceneTex, srcW = w, srcH = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      const tex = d.createTexture({ size: [bw, bh], format: HDR_FORMAT, usage });
      this.bloomTex.push(tex);
      this.bloomDownBG.push(mkBG(srcTex, mkParam([1 / srcW, 1 / srcH, 1.1, i === 0 ? 1 : 0])));
      srcTex = tex; srcW = bw; srcH = bh;
    }
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) {
      const src = this.bloomTex[i + 1];
      this.bloomUpBG.push(mkBG(src, mkParam([1 / src.width, 1 / src.height, 1.0, 0])));
    }
    this.compositeBG = d.createBindGroup({
      layout: this.compBGL,
      entries: [
        { binding: 0, resource: this.sceneTex.createView() },
        { binding: 1, resource: this.bloomTex[0].createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.postBuf } },
      ],
    });
  }

  setViewInsets(top, bottom) {
    const visibleHeight = this.height - top - bottom;
    const usable = visibleHeight >= this.height / 2;
    this.viewInsetTop = usable ? top : 0;
    this.viewInsetBottom = usable ? bottom : 0;
  }

  // --- 毎フレームの描画 ---

  render(game, deltaMs, gameDeltaMs = deltaMs) {
    if (this.lost) return;
    // 検証モードでは前のフレームの処理が終わるまで次を積まない（ソフトウェア描画で詰まるのを防ぐ）
    if (this.readback && this.inflight) return;
    const dt = deltaMs / 1000;
    this.time += dt;
    const fx = game.animations;

    this.syncWorld(game);
    this.updateFog(game, dt);
    this.updateCamera(game, dt);

    // 描画リスト
    this.drawCount = 0;
    this.meshDraws = [];
    this.glyphDraws = [];
    this.fxCount = 0;
    this.frameLights = [];

    this.addDraw(this.meshDraws, this.world.mesh, mat4());
    this.drawPlayer(game, dt, gameDeltaMs);
    this.drawItems(game);
    this.drawMonsters(game, gameDeltaMs);
    this.drawTraps(game);
    this.drawDoorsAndFeatures(game, dt);
    this.drawFx(game);
    this.collectLights(game);
    this.writeFrameUniforms();

    const d = this.device;
    d.queue.writeBuffer(this.drawBuf, 0, this.drawData, 0, (DRAW_SLOT / 4) * this.drawCount);
    if (this.fxCount) d.queue.writeBuffer(this.fxBuf, 0, this.fxData, 0, this.fxCount * FX_FLOATS);

    this.frameNo = (this.frameNo || 0) + 1;
    const enc = d.createCommandEncoder();
    // 1. シーン（MSAA → HDR テクスチャへ解決）
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        ...(this.samples > 1
          ? { view: this.msaaTex.createView(), resolveTarget: this.sceneTex.createView() }
          : { view: this.sceneTex.createView() }),
        clearValue: { r: FOG_COLOR[0], g: FOG_COLOR[1], b: FOG_COLOR[2], a: 1 }, loadOp: 'clear', storeOp: this.samples > 1 ? 'discard' : 'store',
      }],
      depthStencilAttachment: {
        view: this.depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard',
      },
    });
    pass.setBindGroup(0, this.frameBG);
    pass.setPipeline(this.meshPipeline);
    for (const dr of this.meshDraws) {
      pass.setBindGroup(1, this.drawBG, [dr.slot * DRAW_SLOT]);
      pass.setVertexBuffer(0, dr.mesh.buf);
      pass.draw(dr.mesh.count);
    }
    if (this.glyphDraws.length) {
      pass.setPipeline(this.glyphPipeline);
      pass.setVertexBuffer(0, this.glyphBox.buf);
      for (const dr of this.glyphDraws) {
        pass.setBindGroup(1, this.drawBG, [dr.slot * DRAW_SLOT]);
        pass.draw(this.glyphBox.count);
      }
    }
    if (this.fxCount) {
      pass.setPipeline(this.fxPipeline);
      pass.setBindGroup(1, this.drawBG, [0]);
      pass.setVertexBuffer(0, this.fxBuf);
      pass.draw(6, this.fxCount);
    }
    pass.end();

    // 2. ブルーム（縮小 → 拡大しながら加算）
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.bloomTex[i].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      p.setPipeline(this.bloomDownPipeline);
      p.setBindGroup(0, this.bloomDownBG[i]);
      p.draw(3);
      p.end();
    }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.bloomTex[i].createView(), loadOp: 'load', storeOp: 'store' }] });
      p.setPipeline(this.bloomUpPipeline);
      p.setBindGroup(0, this.bloomUpBG[i]);
      p.draw(3);
      p.end();
    }

    // 3. 合成（トーンマップ・色収差・ビネット・フラッシュ）
    this.writePostUniforms(game);
    const target = this.readback ? this.readbackTex : this.gpu.getCurrentTexture();
    const out = enc.beginRenderPass({
      colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    out.setPipeline(this.compositePipeline);
    out.setBindGroup(0, this.compositeBG);
    out.draw(3);
    out.end();
    const doReadback = this.readback && !this.readbackBusy;
    if (doReadback) {
      enc.copyTextureToBuffer({ texture: this.readbackTex }, { buffer: this.readbackBuf, bytesPerRow: this.readbackRow }, [this.readbackTex.width, this.readbackTex.height]);
    }
    d.queue.submit([enc.finish()]);
    if (doReadback) this.copyReadback();
    if (this.readback) {
      this.inflight = true;
      d.queue.onSubmittedWorkDone().then(() => { this.inflight = false; });
    }

    // 4. 文字（2D）
    this.drawOverlay(game);
  }

  // 階層が変わったら地形を作り直す
  // 階が変わったら地形を作り直し、同じ階で地形が変わった（部屋に明かりが灯った等）ら形だけ作り直す
  syncWorld(game) {
    const floorKey = game.floorSerial;
    const rev = game.map.revision || 0;
    if (this.floorKey === floorKey && this.worldRev === rev && this.world) return;
    const newFloor = this.floorKey !== floorKey;
    this.floorKey = floorKey;
    this.worldRev = rev;
    if (this.world) this.world.mesh.buf.destroy();
    const w = buildWorld(game.map);
    this.world = { mesh: this.mesh(w.vertices), lights: w.lights, flames: w.flames };
    if (newFloor) {
      this.fogVis.fill(0);
      this.fogMem.fill(0);
      this.snapCamera = true;
    }
  }

  // 視界テクスチャを滑らかに追従させて転送
  updateFog(game, dt) {
    const map = game.map;
    const k = damp(FOG_SPEED, dt);
    const bytes = this.fogBytes;
    for (let y = 0; y < this.fogH; y++) {
      for (let x = 0; x < this.fogW; x++) {
        const i = y * this.fogW + x;
        const vis = map.visible[y] && map.visible[y][x] ? 1 : 0;
        const mem = map.visited[y] && map.visited[y][x] ? 1 : 0;
        this.fogVis[i] += (vis - this.fogVis[i]) * k;
        this.fogMem[i] += (mem - this.fogMem[i]) * k;
        bytes[i * 4] = this.fogVis[i] * 255;
        bytes[i * 4 + 1] = this.fogMem[i] * 255;
      }
    }
    this.device.queue.writeTexture({ texture: this.fogTex }, bytes, { bytesPerRow: this.fogW * 4 }, [this.fogW, this.fogH]);
  }

  updateCamera(game, dt) {
    const fx = game.animations;
    const p = game.player;
    const px = p.renderX / CONFIG.TILE_SIZE + 0.5;
    const pz = p.renderY / CONFIG.TILE_SIZE + 0.5;
    const cfx = fx.getCameraFx();

    // 注視点：プレイヤーの少し前方（向いている方へ）と、演出の注目点
    let tx = px + p.facing.dx * 0.35;
    let tz = pz + p.facing.dy * 0.25;
    if (cfx.focus) {
      tx = lerp(tx, cfx.focus.x, Math.min(0.6, cfx.focus.amount * 2));
      tz = lerp(tz, cfx.focus.z, Math.min(0.6, cfx.focus.amount * 2));
    }
    const k = this.snapCamera ? 1 : damp(7, dt);
    this.camTarget[0] += (tx - this.camTarget[0]) * k;
    this.camTarget[1] = 0.35;
    this.camTarget[2] += (tz - this.camTarget[2]) * k;

    // 縦長画面では少し引いて視野を確保
    const aspect = this.width / Math.max(1, this.height - this.viewInsetTop - this.viewInsetBottom);
    let dist = CAM_DIST * (aspect < 1 ? 1 + (1 - aspect) * 0.55 : 1);
    let pitch = CAM_PITCH;
    dist *= 1 - Math.min(0.35, cfx.zoom * 0.12) - (cfx.focus ? cfx.focus.amount * 0.35 : 0);

    // 階層に入った直後：高い位置から降りてくる
    if (fx.introMs > 0) {
      const t = 1 - fx.introMs / 1400;
      const e = 1 - Math.pow(1 - clamp(t, 0, 1), 3);
      dist *= lerp(1.9, 1, e);
      pitch = lerp(1.35, CAM_PITCH, e);
      this.camYaw = lerp(-0.6, 0, e);
    } else if (game.state === GAME_STATES.GAME_OVER) {
      // ゲームオーバー：倒れた騎士の周りをゆっくり回る
      this.camYaw += dt * 0.35;
      dist *= 0.7;
      pitch = 0.75;
    } else {
      this.camYaw += (0 - this.camYaw) * damp(3, dt);
    }
    this.snapCamera = false;

    const ex = this.camTarget[0] + Math.sin(this.camYaw) * Math.cos(pitch) * dist + cfx.x;
    const ey = this.camTarget[1] + Math.sin(pitch) * dist + cfx.y;
    const ez = this.camTarget[2] + Math.cos(this.camYaw) * Math.cos(pitch) * dist + cfx.z;
    const target = [this.camTarget[0] + cfx.x, this.camTarget[1] + cfx.y * 0.5, this.camTarget[2] + cfx.z];
    const up = [Math.sin(cfx.roll), Math.cos(cfx.roll), 0];
    const view = lookAt(mat4(), [ex, ey, ez], target, up);

    // HUD に隠れない範囲の中央に注視点が来るようレンズをずらす
    const visH = this.height - this.viewInsetTop - this.viewInsetBottom;
    const shiftY = 1 - 2 * (this.viewInsetTop + visH / 2) / this.height;
    const fov = CAM_FOV * (this.width < this.height ? 1.25 : 1);
    const proj = perspective(mat4(), fov, this.width / this.height, 0.3, 60, 0, shiftY);
    multiply(this.viewProj, proj, view);
    this.camPos = [ex, ey, ez];
    this.camRight = [view[0], view[4], view[8]];
    this.camUp = [view[1], view[5], view[9]];
    this.playerWorld = [px, 0.5, pz];
  }

  // uniform の区画を確保して描画リストに積む
  addDraw(list, mesh, model, tint = [1, 1, 1], params = [0, 0, 1, 0], glyph = null) {
    if (this.drawCount >= MAX_DRAWS) return;
    const slot = this.drawCount++;
    const o = slot * (DRAW_SLOT / 4);
    const dd = this.drawData;
    dd.set(model, o);
    dd.set(invert(new Float32Array(16), model), o + 16);
    dd[o + 32] = tint[0]; dd[o + 33] = tint[1]; dd[o + 34] = tint[2]; dd[o + 35] = 1;
    dd[o + 36] = params[0]; dd[o + 37] = params[1]; dd[o + 38] = params[2]; dd[o + 39] = params[3];
    if (glyph) dd.set(glyph, o + 40);
    list.push({ slot, mesh });
  }

  // --- プレイヤー（騎士） ---

  drawPlayer(game, dt, gameDeltaMs) {
    const p = game.player;
    const a = this.anim;
    let px = p.renderX / CONFIG.TILE_SIZE + 0.5;
    let pz = p.renderY / CONFIG.TILE_SIZE + 0.5;

    // 歩行速度（描画位置の変化量）
    const moved = Math.hypot(px - a.lastX, pz - a.lastZ);
    a.lastX = px; a.lastZ = pz;
    const speed = dt > 0 ? Math.min(12, moved / dt) : 0;
    a.speed += (speed - a.speed) * damp(12, dt);
    a.walk += a.speed * dt * 3.2;

    // 向き
    const targetYaw = Math.atan2(p.facing.dx, p.facing.dy);
    a.yaw = lerpAngle(a.yaw, targetYaw, damp(16, dt));

    // 攻撃の踏み込み・被弾ののけぞり
    let atk = -1;
    if (p.attackAnimTimer > 0) atk = 1 - p.attackAnimTimer / ATTACK_ANIM_MS;
    let hurt = p.damageAnimTimer > 0 ? p.damageAnimTimer / DAMAGE_ANIM_MS : 0;
    if (atk >= 0) {
      const k = atk < 0.3 ? atk / 0.3 : 1 - (atk - 0.3) / 0.7;
      px += p.facing.dx * LUNGE * k;
      pz += p.facing.dy * LUNGE * k;
    }
    if (hurt > 0 && p.hitFromDir) {
      px -= p.hitFromDir.dx * RECOIL * hurt;
      pz -= p.hitFromDir.dy * RECOIL * hurt;
    }

    // 倒れる（ゲームオーバー）
    const dead = game.state === GAME_STATES.GAME_OVER;
    a.fall += ((dead ? 1 : 0) - a.fall) * damp(dead ? 3 : 20, dt);

    const walkAmt = Math.min(1, a.speed / 4);
    const swing = Math.sin(a.walk) * 0.7 * walkAmt;
    const bob = Math.abs(Math.cos(a.walk)) * 0.035 * walkAmt + Math.sin(this.time * 2.2) * 0.008;
    const lean = -a.fall * 1.45 + walkAmt * 0.12 - hurt * 0.35 + (atk >= 0 ? Math.sin(atk * Math.PI) * 0.25 : 0);
    const twist = atk >= 0 ? (atk < 0.35 ? -0.5 * atk / 0.35 : -0.5 + 1.1 * Math.min(1, (atk - 0.35) / 0.25)) * (1 - Math.max(0, atk - 0.7) / 0.3) : 0;

    const root = compose(mat4(), px, bob + a.fall * 0.08, pz, a.yaw, lean, 0);
    const flash = hurt > 0.6 ? (hurt - 0.6) * 2.5 : 0;
    const params = [flash, 0, 1, 1];
    const tint = hurt > 0 ? [1, 1 - hurt * 0.5, 1 - hurt * 0.5] : [1, 1, 1];

    // 脚
    for (const s of [-1, 1]) {
      const leg = multiply(mat4(), root, compose(mat4(), s * 0.075, HIP_Y, 0, 0, s * swing - a.fall * 0.3, 0));
      this.addDraw(this.meshDraws, this.playerLeg, leg, tint, params);
    }
    // 胴体（攻撃時に腰をひねる）
    const body = multiply(mat4(), root, compose(mat4(), 0, HIP_Y, 0, twist, 0, 0));
    this.addDraw(this.meshDraws, this.playerBody, body, tint, params);

    // 右腕と剣：振りかぶって一気に振り下ろす
    let armR = -0.35 - swing * 0.6;
    let swordTilt = 1.35;
    if (atk >= 0) {
      if (atk < 0.3) {
        armR = lerp(-0.35, -2.9, atk / 0.3);
        swordTilt = lerp(1.35, 0.4, atk / 0.3);
      } else if (atk < 0.5) {
        const t = (atk - 0.3) / 0.2;
        armR = lerp(-2.9, -0.5, t * t);
        swordTilt = lerp(0.4, 1.6, t);
      } else {
        const t = (atk - 0.5) / 0.5;
        armR = lerp(-0.5, -0.35, t);
        swordTilt = lerp(1.6, 1.35, t);
      }
    }
    if (dead) armR = -0.2;
    const shoulderR = multiply(mat4(), body, compose(mat4(), -SHOULDER.x, SHOULDER.y, 0, 0, armR, -0.12));
    this.addDraw(this.meshDraws, this.playerArm, shoulderR, tint, params);
    const weaponId = game.inventory.equippedWeapon ? game.inventory.equippedWeapon.id : null;
    if (weaponId) {
      const sword = multiply(mat4(), shoulderR, compose(mat4(), 0, -0.34, 0.02, 0, swordTilt, 0));
      const glowBoost = atk >= 0.3 && atk < 0.55 ? 1.5 : 0;
      this.addDraw(this.meshDraws, this.getSword(weaponId), sword, tint, [flash, glowBoost, 1, 1]);
      // 振り下ろす剣の軌跡
      if (glowBoost > 0) {
        const tip = transformPoint(sword, 0, 0.5, 0);
        this.pushFx(FX.GLOW, tip[0], tip[1], tip[2], 0.18, [1.2, 1.8, 2.6], 0.8);
      }
    }

    // 左腕と盾：体の前に構える
    const armL = -0.55 - (-swing) * 0.5 + (atk >= 0 ? -0.3 : 0);
    const shoulderL = multiply(mat4(), body, compose(mat4(), SHOULDER.x, SHOULDER.y, 0, 0, armL, 0.12));
    this.addDraw(this.meshDraws, this.playerArm, shoulderL, tint, params);
    const shieldId = game.inventory.equippedShield ? game.inventory.equippedShield.id : null;
    if (shieldId) {
      const shield = multiply(mat4(), shoulderL, compose(mat4(), 0.04, -0.27, 0.1, 0.35, -armL - 0.1, 0));
      this.addDraw(this.meshDraws, this.getShield(shieldId), shield, tint, params);
    }

    // マント（歩く速さと攻撃でなびく）
    a.capeLift += ((walkAmt * 0.12 + (atk >= 0 ? 0.1 : 0)) - a.capeLift) * damp(5, dt);
    const cb = this.capeBuilder;
    cb.data.length = 0;
    writeCape(cb, this.time, 0.03 + walkAmt * 0.03, a.capeLift);
    this.device.queue.writeBuffer(this.cape.buf, 0, cb.toArray());
    this.addDraw(this.meshDraws, this.cape, body, tint, params);

    // 向きを示す足元の矢印
    if (!dead) {
      const fdx = p.facing.dx, fdz = p.facing.dy;
      const len = Math.hypot(fdx, fdz);
      this.pushFx(FX.STREAK, px + fdx / len * 0.62, 0.02, pz + fdz / len * 0.62, 0.05, [0.25, 0.8, 1.2], 0.9,
        [-fdx / len * 0.3, 0, -fdz / len * 0.3]);
    }
    this.playerRender = [px, pz];
  }

  getSword(id) {
    if (!this.swordMeshes.has(id)) this.swordMeshes.set(id, this.mesh(buildSword(id)));
    return this.swordMeshes.get(id);
  }

  getShield(id) {
    if (!this.shieldMeshes.has(id)) this.shieldMeshes.set(id, this.mesh(buildShield(id)));
    return this.shieldMeshes.get(id);
  }

  getItemMesh(item) {
    const key = `${item.type}:${item.id}`;
    if (!this.itemMeshes.has(key)) this.itemMeshes.set(key, this.mesh(buildItemModel(item)));
    return this.itemMeshes.get(key);
  }

  // --- アイテム（床の上で浮かび、回転し、光る） ---

  drawItems(game) {
    const map = game.map;
    for (const item of game.droppedItems) {
      if (!map.visible[item.y] || !map.visible[item.y][item.x]) continue;
      const x = item.x + 0.5, z = item.y + 0.5;
      const phase = (item.x * 1.7 + item.y * 2.3);
      const bob = 0.08 + Math.sin(this.time * 2.2 + phase) * 0.04;
      const upright = item.type === 'weapon' || item.type === 'staff' || item.type === 'arrow';
      const scale = item.type === 'gold' ? 1.3 : 1.25;
      const model = compose(mat4(), x, bob + (upright ? 0.05 : 0), z, this.time * 1.3 + phase, upright ? 0 : 0.15, 0, scale);
      this.addDraw(this.meshDraws, this.getItemMesh(item), model, [1, 1, 1], [0, 0, 1, 1]);
      const c = hexToRgb(item.color || '#fbbf24');
      const pulse = 0.6 + Math.sin(this.time * 3 + phase) * 0.25;
      this.pushFx(FX.RING, x, 0.015, z, 0.3, c.map(v => v * 0.45), pulse, [0, 0, 0], [0, 0.12, 0.12, 0]);
      this.pushFx(FX.GLOW, x, 0.3, z, 0.45, c.map(v => v * 0.18), pulse);
      // 時々きらめく
      if (Math.sin(this.time * 1.7 + phase * 3) > 0.97) {
        this.pushFx(FX.STAR, x + 0.1, 0.4 + bob, z, 0.12, [3, 3, 3], 1, [0, 0, 0], [this.time * 3, 0, 0, 0]);
      }
    }
  }

  // --- 敵（NetHack の記号） ---

  drawMonsters(game, gameDeltaMs) {
    const map = game.map;
    const p = game.player;
    for (const m of game.monsters) {
      if (!map.visible[m.y] || !map.visible[m.y][m.x]) continue;
      let x = m.renderX / CONFIG.TILE_SIZE + 0.5;
      let z = m.renderY / CONFIG.TILE_SIZE + 0.5;

      // ミミックは宝箱に化けている
      if (m.isMimic) {
        this.addDraw(this.meshDraws, this.chest, compose(mat4(), x, 0, z, 0, 0, 0, 1.2), [1, 1, 1], [0, 0, 1, 1]);
        continue;
      }

      let st = this.monsterAnim.get(m);
      if (!st) {
        st = { seed: Math.random() * 10, yaw: 0 };
        this.monsterAnim.set(m, st);
      }
      const dx = Math.sign(p.x - m.x), dz = Math.sign(p.y - m.y);
      const hurt = m.damageAnimTimer > 0 ? m.damageAnimTimer / DAMAGE_ANIM_MS : 0;
      let atk = m.attackAnimTimer > 0 ? 1 - m.attackAnimTimer / ATTACK_ANIM_MS : -1;
      let lungeK = 0;
      if (atk >= 0) {
        lungeK = atk < 0.3 ? atk / 0.3 : 1 - (atk - 0.3) / 0.7;
        x += dx * 0.4 * lungeK;
        z += dz * 0.4 * lungeK;
      }
      if (hurt > 0) {
        x -= dx * 0.18 * hurt + Math.sin(hurt * 40) * 0.03 * hurt;
        z -= dz * 0.18 * hurt;
      }
      // プレイヤーの方へ少し向く
      const targetYaw = m.isAlert ? clamp(Math.atan2(p.x - m.x, p.y - m.y + 3), -0.6, 0.6) : Math.sin(this.time * 0.7 + st.seed) * 0.25;
      st.yaw = lerpAngle(st.yaw, targetYaw, 0.1);

      const floaty = ['cave_bat', 'phantom', 'beholder', 'wraith'].includes(m.defId);
      const big = ['dragon', 'arch_demon', 'lich', 'troll', 'minotaur'].includes(m.defId) ? 1.25 : 1;
      const bob = floaty ? 0.18 + Math.sin(this.time * 3 + st.seed) * 0.07 : Math.abs(Math.sin(this.time * 3 + st.seed)) * 0.03;
      const breathe = 1 + Math.sin(this.time * 2.5 + st.seed) * 0.03;
      const squash = hurt * 0.3;
      const size = 1.1 * big;
      const sleeping = m.statusEffects.sleep > 0;
      const tiltBack = -0.38 + lungeK * 0.5 + (sleeping ? 0.5 : 0);
      const model = compose(mat4(), x, 0.5 * size + bob - squash * 0.15, z, st.yaw, tiltBack, Math.sin(this.time * 1.5 + st.seed) * 0.05,
        size * (1 + squash) * breathe, size * (1 - squash) * breathe, size);
      const glyph = MONSTER_GLYPHS[m.defId] || '?';
      const rect = this.glyphRects[glyph];
      const c = hexToRgb(m.color);
      const flash = hurt > 0.55 ? (hurt - 0.55) * 2.2 : 0;
      const glow = atk >= 0 ? 1.5 * lungeK : (m.isAlert ? 0.15 : 0);
      this.addDraw(this.glyphDraws, null, model, c, [flash, glow, 1, 0], rect);

      // 足元の影と色の光だまり
      this.pushFx(FX.GLOW, x, 0.05, z, 0.55, c.map(v => v * 0.2), 0.8);
      this.frameLights.push({ x, y: 0.9, z, color: c, intensity: 0.45 + glow, radius: 2.2, prio: 1 });
      if (m.statusEffects.speed > 0 || m.speed >= 2) {
        this.pushFx(FX.DUST, x, 0.2, z, 0.3, c.map(v => v * 0.3), 0.5);
      }
    }

    // 撃破された敵の記号：白熱して膨らみ、消える
    for (const dth of game.animations.deaths) {
      const t = 1 - dth.life / dth.maxLife;
      if (t > 0.45) continue;
      const s = 0.95 * (1 + t * 1.2);
      const model = compose(mat4(), dth.x, 0.5 + t * 0.3, dth.z, 0, -0.38, t * 0.6, s, s * (1 - t), s);
      this.addDraw(this.glyphDraws, null, model, dth.color, [Math.min(1, 0.5 + t * 2), 2, 1, 0], this.glyphRects[dth.glyph] || this.glyphRects['?']);
    }
  }

  // 扉（開閉を滑らかに動かす）と、噴水・祭壇・流し台・墓
  drawDoorsAndFeatures(game, dt) {
    const map = game.map;
    const T = CONFIG.TILES;
    const cx = this.camTarget[0], cz = this.camTarget[2];
    for (const door of map.doors.values()) {
      const { x, y } = door;
      if (!map.visited[y] || !map.visited[y][x]) continue;
      if (Math.abs(x + 0.5 - cx) > 14 || Math.abs(y + 0.5 - cz) > 12) continue;
      if (door.state === 'none') continue;
      const ns = map.getTile(x - 1, y) === T.WALL && map.getTile(x + 1, y) === T.WALL;
      if (door.state === 'broken') {
        this.addDraw(this.meshDraws, this.brokenDoor, compose(mat4(), x + 0.5, 0, y + 0.5, ns ? 0 : Math.PI / 2), [1, 1, 1], [0, 0, 1, 1]);
        continue;
      }
      // 0 = 閉, 1 = 開
      const target = door.state === 'open' ? 1 : 0;
      let a = this.doorAnim.get(door);
      if (a === undefined) a = target;
      a += (target - a) * damp(10, dt);
      this.doorAnim.set(door, a);
      // 南北に抜ける出入口：扉は東西に広がり、西側の柱を蝶番にして北（奥）へ開く
      const baseYaw = ns ? 0 : Math.PI / 2;
      const hx = ns ? x + 0.07 : x + 0.5;
      const hz = ns ? y + 0.5 : y + 0.93;
      const model = compose(mat4(), hx, 0.02, hz, baseYaw + a * Math.PI * 0.5 * (ns ? 1 : 1));
      const flash = 0;
      this.addDraw(this.meshDraws, door.state === 'locked' ? this.doorLeafLocked : this.doorLeaf, model, [1, 1, 1], [flash, 0, 1, 1]);
    }
    for (const f of map.features.values()) {
      if (!map.visited[f.y] || !map.visited[f.y][f.x]) continue;
      const mesh = this.featureMeshes[f.type];
      if (!mesh) continue;
      const fx = f.x + 0.5, fz = f.y + 0.5;
      this.addDraw(this.meshDraws, mesh, compose(mat4(), fx, 0, fz, 0), [1, 1, 1], [0, 0, 1, 1]);
      if (!map.visible[f.y] || !map.visible[f.y][f.x]) continue;
      if (f.type === 'fountain') {
        // 噴き上がる水と、水面のきらめき
        for (let i = 0; i < 6; i++) {
          const t = (this.time * 1.2 + i / 6) % 1;
          const ang = i * 1.05 + this.time * 0.3;
          const r = t * 0.3;
          this.pushFx(FX.GLOW, fx + Math.cos(ang) * r, 0.58 + t * 0.25 - t * t * 0.55, fz + Math.sin(ang) * r, 0.03, [0.6, 1.2, 2.2], 1 - t);
        }
        this.pushFx(FX.RING, fx, 0.13, fz, 0.2 + ((this.time * 0.5) % 1) * 0.15, [0.4, 0.8, 1.6], 0.5, [0, 0, 0], [0, 0.1, 0.1, 0]);
        this.frameLights.push({ x: fx, y: 0.6, z: fz, color: [0.35, 0.6, 1], intensity: 0.5, radius: 2.5 });
      } else if (f.type === 'altar') {
        for (const s of [-0.28, 0.28]) {
          this.pushFx(FX.FLAME, fx + s, 0.68, fz, 0.035, [3.5, 1.8, 0.5], 1, [0, 0, 0], [0, 0, 0, f.x * 3 + s]);
        }
        this.frameLights.push({ x: fx, y: 0.9, z: fz, color: [1, 0.75, 0.4], intensity: 0.6, radius: 2.8 });
      }
    }
  }

  // 見つけた罠：床に刻まれた '^'
  drawTraps(game) {
    const map = game.map;
    const rect = this.glyphRects[TRAP_GLYPH];
    for (const t of map.traps) {
      if (!t.isRevealed || !map.visible[t.y] || !map.visible[t.y][t.x]) continue;
      const model = compose(mat4(), t.x + 0.5, 0.06, t.y + 0.5, 0, -Math.PI / 2 + 0.25, 0, 0.62);
      const c = hexToRgb(t.type.color);
      this.addDraw(this.glyphDraws, null, model, c, [0, 0.6 + Math.sin(this.time * 4) * 0.3, 1, 0], rect);
      this.pushFx(FX.RING, t.x + 0.5, 0.015, t.y + 0.5, 0.42, c.map(v => v * 1.5), 0.7, [0, 0, 0], [0, 0.12, 0.12, 0]);
    }
  }

  // --- パーティクル・炎・ビーム・投擲物 ---

  pushFx(kind, x, y, z, size, color, alpha = 1, dir = [0, 0, 0], params = [0, 0, 0, 0]) {
    if (this.fxCount >= MAX_FX) return;
    const o = this.fxCount++ * FX_FLOATS;
    const f = this.fxData;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = size;
    f[o + 4] = color[0]; f[o + 5] = color[1]; f[o + 6] = color[2]; f[o + 7] = alpha;
    f[o + 8] = dir[0]; f[o + 9] = dir[1]; f[o + 10] = dir[2]; f[o + 11] = kind;
    f[o + 12] = params[0]; f[o + 13] = params[1]; f[o + 14] = params[2]; f[o + 15] = params[3];
  }

  drawFx(game) {
    const fx = game.animations;
    const map = game.map;
    const cx = this.camTarget[0], cz = this.camTarget[2];

    // 松明の炎
    for (const fl of this.world.flames) {
      if (Math.abs(fl.x - cx) > 14 || Math.abs(fl.z - cz) > 12) continue;
      const gx = Math.floor(fl.x), gy = Math.floor(fl.z);
      if (!map.visited[gy] || !map.visited[gy][gx]) continue;
      const seed = fl.x * 3.1 + fl.z;
      const fl1 = 1 + Math.sin(this.time * 17 + seed) * 0.1;
      this.pushFx(FX.FLAME, fl.x, fl.y + 0.06, fl.z, 0.13 * fl1, [3.2, 1.3, 0.35], 1, [0, 0, 0], [0, 0, 0, seed]);
      this.pushFx(FX.FLAME, fl.x, fl.y + 0.04, fl.z, 0.08, [4, 2.8, 1.2], 1, [0, 0, 0], [0, 0, 0, seed + 3]);
      this.pushFx(FX.GLOW, fl.x, fl.y, fl.z, 0.55, [0.5, 0.2, 0.05], 0.8);
      // 火の粉
      const ember = (this.time * 0.8 + seed) % 1;
      this.pushFx(FX.GLOW, fl.x + Math.sin(seed + this.time * 3) * 0.05, fl.y + 0.1 + ember * 0.5, fl.z, 0.02, [3, 1.4, 0.3], 1 - ember);
    }
    // 階段の青い光
    if (map.stairs && map.visited[map.stairs.y][map.stairs.x]) {
      const sx = map.stairs.x + 0.5, sz = map.stairs.y + 0.5;
      this.pushFx(FX.GLOW, sx, 0.1, sz, 0.9, [0.1, 0.35, 0.8], 0.8 + Math.sin(this.time * 2) * 0.2);
      for (let i = 0; i < 3; i++) {
        const t = (this.time * 0.4 + i / 3) % 1;
        this.pushFx(FX.GLOW, sx + Math.sin(i * 2.1 + this.time) * 0.25, -0.4 + t * 1.2, sz + Math.cos(i * 1.7) * 0.2, 0.025, [0.6, 1.5, 3], 1 - t);
      }
    }
    // 漂う塵（明かりに照らされて見える）
    const px = this.playerWorld[0], pz = this.playerWorld[2];
    for (let i = 0; i < 40; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12345.678;
      const r1 = h1 - Math.floor(h1), r2 = h2 - Math.floor(h2);
      const t = this.time * (0.05 + r1 * 0.05);
      const mx = Math.floor(px) + ((r1 * 9 + Math.sin(t + i) * 0.5) % 9) - 4.5;
      const mz = Math.floor(pz) + ((r2 * 7 + t) % 7) - 3.5;
      const my = 0.3 + ((r1 + r2 + t * 0.3) % 1) * 1.1;
      this.pushFx(FX.GLOW, mx, my, mz, 0.012, [0.9, 0.7, 0.45], 0.5 + 0.5 * Math.sin(this.time * 2 + i));
    }

    // 演出のパーティクル
    for (const p of fx.particles) {
      const t = p.life / p.maxLife;
      let alpha = p.alpha * (p.kind === FX.DUST ? t * 0.6 : Math.min(1, t * 1.6));
      let dir = [0, 0, 0];
      if (p.kind === FX.STREAK && p.streak) dir = [-p.vx * p.streak, -p.vy * p.streak, -p.vz * p.streak];
      if (p.kind === FX.RING) alpha = t;
      if (p.kind === FX.SHOCK) alpha = t * 0.55;
      const rot = (p.kind === FX.SLASH || p.kind === FX.RING) ? p.p1 : p.rot;
      this.pushFx(p.kind, p.x, p.y, p.z, p.size, p.color.map(v => v * p.intensity), alpha, dir, [rot, p.p2, p.p2, p.p2 || p.rot]);
    }

    // ビーム
    for (const b of fx.beams) {
      const t = b.life / b.maxLife;
      const w = 0.14 * (0.4 + t);
      const dir = [b.x1 - b.x0, 0, b.z1 - b.z0];
      this.pushFx(FX.BEAM, b.x0, 0.55, b.z0, w, b.color.map(v => v * 2), t, dir);
      this.pushFx(FX.GLOW, b.x0, 0.55, b.z0, 0.6 * t, b.color.map(v => v * 3), t);
    }

    // 投擲物（アイテムはそのモデル、矢は矢のモデル）
    for (const pr of fx.projectiles) {
      const t = Math.min(1, pr.progress);
      const x = lerp(pr.x0, pr.x1, t), z = lerp(pr.z0, pr.z1, t);
      const y = 0.5 + Math.sin(t * Math.PI) * pr.arc;
      const yaw = Math.atan2(pr.x1 - pr.x0, pr.z1 - pr.z0);
      if (pr.item && pr.item.type !== 'arrow') {
        this.addDraw(this.meshDraws, this.getItemMesh(pr.item), compose(mat4(), x, y - 0.15, z, yaw, pr.spin, 0, 1.1));
      } else {
        // 矢は進行方向へ寝かせる
        this.addDraw(this.meshDraws, this.arrow, compose(mat4(), x, y, z, yaw, Math.PI / 2, 0, 1.2));
      }
      this.pushFx(FX.STREAK, x, y, z, 0.05, [1.5, 1.5, 1.8], 0.6, [-(pr.x1 - pr.x0) * 0.1, 0, -(pr.z1 - pr.z0) * 0.1]);
    }
  }

  // 光源：プレイヤーの明かり＋演出の閃光＋松明など（近いものから上限まで）
  collectLights(game) {
    const fx = game.animations;
    const [px, , pz] = this.playerWorld;
    const lights = [];
    const flick = 1 + Math.sin(this.time * 11) * 0.04 + Math.sin(this.time * 23.7) * 0.03;
    lights.push({ x: px - 0.1, y: 1.25, z: pz + 0.3, color: [1, 0.72, 0.45], intensity: 1.35 * flick, radius: 6 });
    lights.push({ x: this.camPos[0], y: this.camPos[1] - 2, z: this.camPos[2] - 2, color: [0.35, 0.45, 0.7], intensity: 0.25, radius: 14 });
    for (const l of fx.lights) {
      const t = l.life / l.maxLife;
      lights.push({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity * t * 0.3, radius: l.radius });
    }
    // 敵の光（近い順に数個）
    const mon = this.frameLights.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 6);
    lights.push(...mon);
    // 松明など
    const world = this.world.lights
      .map(l => ({ l, d: Math.hypot(l.x - this.camTarget[0], l.z - this.camTarget[2]) }))
      .filter(o => o.d < 16)
      .sort((a, b) => a.d - b.d);
    for (const { l } of world) {
      if (lights.length >= MAX_LIGHTS) break;
      const n = Math.sin(this.time * 9 + l.seed) * 0.5 + Math.sin(this.time * 23 + l.seed * 2) * 0.3;
      lights.push({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity * (1 + l.flicker * n * 0.5), radius: l.radius });
    }
    this.lightsOut = lights.slice(0, MAX_LIGHTS);
  }

  writeFrameUniforms() {
    const f = this.frameData;
    f.set(this.viewProj, 0);
    let o = 16;
    f[o++] = this.camPos[0]; f[o++] = this.camPos[1]; f[o++] = this.camPos[2]; f[o++] = this.time;
    f[o++] = this.camRight[0]; f[o++] = this.camRight[1]; f[o++] = this.camRight[2]; f[o++] = 0;
    f[o++] = this.camUp[0]; f[o++] = this.camUp[1]; f[o++] = this.camUp[2]; f[o++] = 0;
    f[o++] = this.playerWorld[0]; f[o++] = 0.5; f[o++] = this.playerWorld[2]; f[o++] = 1.15;
    f[o++] = this.fogW; f[o++] = this.fogH; f[o++] = 1 / this.fogW; f[o++] = 1 / this.fogH;
    f[o++] = AMBIENT[0]; f[o++] = AMBIENT[1]; f[o++] = AMBIENT[2]; f[o++] = this.lightsOut.length;
    f[o++] = FOG_COLOR[0]; f[o++] = FOG_COLOR[1]; f[o++] = FOG_COLOR[2]; f[o++] = 0.06;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = this.lightsOut[i];
      if (l) {
        f[o++] = l.x; f[o++] = l.y; f[o++] = l.z; f[o++] = l.radius;
        f[o++] = l.color[0]; f[o++] = l.color[1]; f[o++] = l.color[2]; f[o++] = l.intensity;
      } else {
        for (let k = 0; k < 8; k++) f[o++] = 0;
      }
    }
    this.device.queue.writeBuffer(this.frameBuf, 0, f);
  }

  writePostUniforms(game) {
    const fx = game.animations;
    const p = game.player;
    const f = this.postData;
    const hpRatio = p.hp / p.maxHp;
    const low = hpRatio <= 0.25 && game.state === GAME_STATES.PLAYING ? (0.25 - hpRatio) / 0.25 : 0;
    const pulse = low > 0 ? (Math.sin(this.time * 6) * 0.5 + 0.5) * (0.25 + low * 0.35) : 0;
    const dead = game.state === GAME_STATES.GAME_OVER;
    fx.desaturate += ((dead ? 1 : 0) - fx.desaturate) * 0.02;
    f[0] = 1.0;                         // 露出
    f[1] = 0.22;                        // ブルーム
    f[2] = fx.caAmount;                 // 色収差
    f[3] = this.time % 100;
    const fl = fx.screenFlash;
    if (fl) {
      const t = fl.life / fl.maxLife;
      f[4] = fl.color[0]; f[5] = fl.color[1]; f[6] = fl.color[2]; f[7] = fl.alpha * t * t;
    } else {
      f[4] = f[5] = f[6] = f[7] = 0;
    }
    f[8] = fx.hurtAmount * 0.9;
    f[9] = 1 - fx.desaturate * 0.85;
    f[10] = fx.getFade();
    f[11] = pulse;
    f[12] = this.width / this.height;
    this.device.queue.writeBuffer(this.postBuf, 0, f);
  }

  // 検証用：描画結果を 2D キャンバスへ転写
  async copyReadback() {
    this.readbackBusy = true;
    const buf = this.readbackBuf;
    const w = this.readbackTex.width, h = this.readbackTex.height;
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    if (!this.readbackCanvas) {
      this.readbackCanvas = this.canvas;
      this.readbackCtx = this.canvas.getContext('2d');
    }
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(src.subarray(y * this.readbackRow, y * this.readbackRow + w * 4), y * w * 4);
    buf.unmap();
    if (this.canvas.width === w && this.canvas.height === h) this.readbackCtx.putImageData(img, 0, 0);
    this.readbackBusy = false;
  }

  // ワールド座標 → 画面座標（CSS px）
  project(x, y, z) {
    const p = transformPoint(this.viewProj, x, y, z);
    if (p[3] <= 0) return null;
    return { x: (p[0] * 0.5 + 0.5) * this.width, y: (0.5 - p[1] * 0.5) * this.height, depth: p[3] };
  }

  // --- 2D の重ね描き：ダメージ数値・敵のHPバー・状態・階層名 ---

  drawOverlay(game) {
    const ctx = this.ctx;
    const fx = game.animations;
    ctx.clearRect(0, 0, this.width, this.height);
    const map = game.map;

    // 敵のHPバーと状態
    for (const m of game.monsters) {
      if (!map.visible[m.y] || !map.visible[m.y][m.x] || m.isMimic) continue;
      const s = this.project(m.renderX / CONFIG.TILE_SIZE + 0.5, 1.2, m.renderY / CONFIG.TILE_SIZE + 0.5);
      if (!s) continue;
      const scale = clamp(9 / s.depth, 0.6, 1.4);
      if (m.hp < m.maxHp) {
        const w = 42 * scale, h = 5 * scale;
        const ratio = Math.max(0, m.hp / m.maxHp);
        if (m.hpTrail === undefined || m.hpTrail < ratio) m.hpTrail = ratio;
        if (m.damageAnimTimer <= 0) m.hpTrail = Math.max(ratio, m.hpTrail - 0.02);
        ctx.fillStyle = 'rgba(5, 8, 14, 0.85)';
        ctx.fillRect(s.x - w / 2 - 1, s.y - 1, w + 2, h + 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(s.x - w / 2, s.y, w * m.hpTrail, h);
        ctx.fillStyle = ratio > 0.4 ? '#22c55e' : '#ef4444';
        ctx.fillRect(s.x - w / 2, s.y, w * ratio, h);
      }
      let status = '';
      if (m.statusEffects.sleep > 0) status = 'Zz';
      else if (m.statusEffects.confused > 0) status = '?!';
      else if (m.statusEffects.paralyzed > 0) status = '✦';
      if (status) {
        ctx.font = `700 ${Math.round(13 * scale)}px ${TEXT_FONT}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText(status, s.x + 18 * scale, s.y - 4 + Math.sin(this.time * 3) * 3);
      }
    }
    // プレイヤーの状態
    const ps = game.player.statusEffects;
    if (ps.sleep > 0 || ps.confused > 0 || ps.paralyzed > 0) {
      const s = this.project(this.playerWorld[0], 1.35, this.playerWorld[2]);
      if (s) {
        ctx.font = `700 14px ${TEXT_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText(ps.sleep > 0 ? 'Zz' : (ps.confused > 0 ? '混乱' : '麻痺'), s.x, s.y + Math.sin(this.time * 3) * 3);
      }
    }

    // ダメージ数値
    for (const t of fx.texts) {
      const s = this.project(t.x, t.y, t.z);
      if (!s) continue;
      const life = t.life / t.maxLife;
      const alpha = Math.min(1, life * 3);
      const size = Math.round(24 * t.scale * (1 + t.pop * 0.9) * clamp(9 / s.depth, 0.7, 1.3));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size}px ${TEXT_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, size * 0.2);
      ctx.strokeStyle = 'rgba(3, 5, 10, 0.95)';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 14;
      ctx.strokeText(t.text, s.x, s.y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, s.x, s.y);
      if (t.label) {
        ctx.font = `900 ${Math.round(size * 0.45)}px ${TEXT_FONT}`;
        ctx.lineWidth = 4;
        ctx.strokeText(t.label, s.x, s.y - size * 0.8);
        ctx.fillStyle = '#fff7d6';
        ctx.fillText(t.label, s.x, s.y - size * 0.8);
      }
      ctx.restore();
    }

    // 階層名
    if (fx.floorBanner) {
      const b = fx.floorBanner;
      const p = 1 - b.life / b.maxLife;
      const alpha = p < 0.12 ? p / 0.12 : (p > 0.75 ? (1 - p) / 0.25 : 1);
      const cy = this.viewInsetTop + (this.height - this.viewInsetTop - this.viewInsetBottom) * 0.3;
      const spread = 1 + (1 - Math.min(1, p / 0.2)) * 0.6;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(Math.min(46, this.width / 9))}px ${TEXT_FONT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(6 * spread)}px`;
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#fde68a';
      ctx.strokeText(b.text, this.width / 2, cy);
      ctx.fillText(b.text, this.width / 2, cy);
      const lw = Math.min(260, this.width * 0.6) * Math.min(1, p / 0.3);
      ctx.shadowBlur = 10;
      ctx.fillRect(this.width / 2 - lw / 2, cy + 30, lw, 2);
      ctx.restore();
    }
  }
}
