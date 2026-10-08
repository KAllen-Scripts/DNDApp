/**
 * Deluxe dice: the fanciest roller. Three.js (served at /vendor/three/) with
 * physically based materials (glossy resin with a clear coat, real metal,
 * see-through ice, a rainbow sheen on starry styles), reflections of a soft
 * studio, a sharp key light with soft shadows on the page, engraved numbers
 * that glow on some styles, dice sounds, and a glow on the die that rolled a
 * natural 20 or 1.
 *
 * Made to run fast:
 * - The throw is worked out before it's drawn (dice-physics.js, a few ms), so
 *   drawing a frame is only placing the dice and rendering; nothing runs
 *   between rolls.
 * - One shape and one texture per kind of die and colour, made once and kept.
 * - Shaders are compiled while loading, not on the first roll.
 * - It watches its own frame times and steps down (lower resolution, smaller
 *   shadows, no see-through dice, then no shadows) on a device that can't
 *   keep up, remembering that for the browser. It steps back up when rolls
 *   are easy.
 *
 * Behaves like dice-box-threejs as far as dice.js is concerned (initialize,
 * updateConfig, roll("1d20+2d6@14,3,5"), clearDice, diceList, sounds,
 * loadSounds), plus screenPosition(die) and glow(die, kind).
 */
import * as THREE from '/vendor/three/three.module.js';
import { SHAPES, parseForced, faceLabel } from './dice-shapes.js';
import { simulate, STEP, dieRadius } from './dice-physics.js';

const SPEED = 1.2; // the throw plays a little faster than it was worked out: snappier
const CELL = 256; // texture pixels per face
const QUALITY_KEY = 'dndapp.dice.deluxe';

/** Quality steps, best first. */
const TIERS = [
  { ratio: 2, shadow: 2048, see: true },
  { ratio: 1.5, shadow: 1024, see: true },
  { ratio: 1, shadow: 1024, see: false },
  { ratio: 1, shadow: 0, see: false },
];

/** dice-box-threejs's texture names (the images it ships), and how each looks here. */
const TEXTURES = {
  cloudy: { file: 'cloudy.webp', mode: 'soft-light' },
  fire: { file: 'fire.webp' },
  marble: { file: 'marble.webp' },
  ice: { file: 'ice.webp', mode: 'soft-light', look: 'ice' },
  paper: { file: 'paper.webp' },
  speckles: { file: 'speckles.webp' },
  stars: { file: 'stars.webp', look: 'sheen' },
  astral: { file: 'astral.webp', look: 'sheen' },
  skulls: { file: 'skulls.webp' },
  dragon: { file: 'dragon.webp' },
  lizard: { file: 'lizard.webp' },
  wood: { file: 'wood.webp', look: 'wood' },
  metal: { file: 'metal.webp', look: 'metal' },
  bronze01: { file: 'bronze01.webp', look: 'metal' },
  bronze02: { file: 'bronze02.webp', look: 'metal' },
  bronze03: { file: 'bronze03.webp', look: 'metal' },
  bronze03a: { file: 'bronze03a.webp', look: 'metal' },
  bronze03b: { file: 'bronze03b.webp', look: 'metal' },
  bronze04: { file: 'bronze04.webp', look: 'metal' },
};

/** Styles whose numbers glow (dice.js names colour sets "dndapp-<style>"). */
const GLOWING = new Set(['dragonfire', 'radiant', 'force', 'psychic', 'starrynight', 'astral', 'storm', 'thunder', 'poison', 'acid', 'necrotic']);
const GLITTER = new Set(['glitter', 'rainbow', 'force', 'psychic']);

const pick = (c, i) => (Array.isArray(c) ? c[i % c.length] : c);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- shapes ----------

/** Each face as flat 2D points (x right, y up as the number reads) and its centre's place. */
function faceLayout(kind) {
  const solid = SHAPES[kind];
  const cols = Math.ceil(Math.sqrt(solid.faces.length));
  const rows = Math.ceil(solid.faces.length / cols);
  let extent = 0;
  const faces = solid.faces.map((f, i) => {
    const right = [f.up[1] * f.normal[2] - f.up[2] * f.normal[1], f.up[2] * f.normal[0] - f.up[0] * f.normal[2], f.up[0] * f.normal[1] - f.up[1] * f.normal[0]];
    const pts = f.idx.map((j) => {
      const d = solid.verts[j].map((v, k) => v - f.center[k]);
      const p = [d[0] * right[0] + d[1] * right[1] + d[2] * right[2], d[0] * f.up[0] + d[1] * f.up[1] + d[2] * f.up[2]];
      extent = Math.max(extent, Math.hypot(...p));
      return p;
    });
    return { face: f, pts, cx: (i % cols) * CELL + CELL / 2, cy: Math.floor(i / cols) * CELL + CELL / 2 };
  });
  return { faces, width: cols * CELL, height: rows * CELL, scale: (CELL * 0.47) / extent };
}

const geometries = new Map();
function geometryFor(kind) {
  if (geometries.has(kind)) return geometries.get(kind);
  const solid = SHAPES[kind];
  const layout = faceLayout(kind);
  const r = dieRadius(kind);
  const pos = [];
  const nor = [];
  const uv = [];
  layout.faces.forEach(({ face, pts, cx, cy }) => {
    // Corners anticlockwise seen from outside, or the face is drawn from the inside only.
    const [p0, p1, p2] = face.idx.slice(0, 3).map((j) => solid.verts[j]);
    const e1 = p1.map((v, k) => v - p0[k]);
    const e2 = p2.map((v, k) => v - p0[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const order = face.idx.map((_, m) => m);
    if (n[0] * face.normal[0] + n[1] * face.normal[1] + n[2] * face.normal[2] < 0) order.reverse();
    for (let k = 1; k < order.length - 1; k++) {
      for (const m of [order[0], order[k], order[k + 1]]) {
        const v = solid.verts[face.idx[m]];
        pos.push(v[0] * r, v[1] * r, v[2] * r);
        nor.push(...face.normal);
        uv.push((cx + pts[m][0] * layout.scale) / layout.width, 1 - (cy - pts[m][1] * layout.scale) / layout.height);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  geometries.set(kind, g);
  return g;
}

// ---------- textures ----------

const images = new Map();
function loadImage(name) {
  const t = TEXTURES[name];
  if (!t) return Promise.resolve(null);
  if (!images.has(name)) {
    const img = new Image();
    img.src = `/vendor/dice/textures/${t.file}`;
    images.set(name, img.decode().then(() => img, () => null));
  }
  return images.get(name);
}

function polygon(ctx, pts, cx, cy, scale) {
  ctx.beginPath();
  for (const [x, y] of pts) ctx.lineTo(cx + x * scale, cy - y * scale);
  ctx.closePath();
}

/**
 * The faces of one kind of die in one colour, drawn once: colour, texture and
 * a darker rim (the look of a rounded edge), numbers on top. Also the bump
 * picture (numbers cut in) and, for glowing styles, the glow picture.
 */
function drawAtlas(kind, { color, ink, image, mode, glow }) {
  const layout = faceLayout(kind);
  const make = () => {
    const c = document.createElement('canvas');
    c.width = layout.width;
    c.height = layout.height;
    return c;
  };
  const colour = make();
  const bump = make();
  const glowing = glow ? make() : null;
  const ctx = colour.getContext('2d');
  const b = bump.getContext('2d');
  const gl = glowing?.getContext('2d');
  b.fillStyle = '#808080';
  b.fillRect(0, 0, bump.width, bump.height);
  if (gl) {
    gl.fillStyle = '#000';
    gl.fillRect(0, 0, glowing.width, glowing.height);
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, colour.width, colour.height);
  const fontFor = (px) => `700 ${Math.round(px)}px "Georgia", "Times New Roman", serif`;
  layout.faces.forEach(({ face, pts, cx, cy }, i) => {
    // Texture over the colour, inside the face.
    if (image) {
      ctx.save();
      polygon(ctx, pts, cx, cy, layout.scale);
      ctx.clip();
      ctx.globalCompositeOperation = mode ?? 'multiply';
      ctx.globalAlpha = mode ? 0.7 : 0.9;
      const s = CELL * 1.05;
      // A different part of the picture on each face.
      ctx.drawImage(image, ((i * 0.37) % 1) * Math.max(0, image.width - s), ((i * 0.61) % 1) * Math.max(0, image.height - s), Math.min(s, image.width), Math.min(s, image.height), cx - CELL / 2, cy - CELL / 2, CELL, CELL);
      ctx.restore();
    }
    // A darker rim and a lighter inner line: reads as a rounded edge.
    ctx.save();
    polygon(ctx, pts, cx, cy, layout.scale);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = CELL * 0.07;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = CELL * 0.025;
    polygon(ctx, pts.map(([x, y]) => [x * 0.9, y * 0.9]), cx, cy, layout.scale);
    ctx.stroke();
    ctx.restore();

    const numbers = []; // [text, x, y, angle, size]
    if (kind === 'd4') {
      // A d4 is read at its top corner: each face has the number of each corner, by that corner.
      face.idx.forEach((j, m) => {
        const [x, y] = pts[m];
        numbers.push([String(j + 1), cx + x * layout.scale * 0.55, cy - y * layout.scale * 0.55, Math.atan2(x, y), face.inradius * layout.scale * 0.95]);
      });
    } else {
      const value = kind === 'd100' ? face.value * 10 : face.value;
      const size = face.inradius * layout.scale * (kind === 'd100' ? 0.95 : face.idx.length === 3 ? 1.15 : 1.25);
      numbers.push([faceLabel(kind, value), cx, cy + (face.idx.length === 3 ? size * 0.08 : 0), 0, size]);
    }
    for (const [text, x, y, angle, size] of numbers) {
      for (const [c, fill] of [[ctx, ink], [b, '#000'], [gl, ink]]) {
        if (!c) continue;
        c.save();
        c.translate(x, y);
        c.rotate(angle);
        c.fillStyle = fill;
        c.font = fontFor(size);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        if (c === ctx) {
          c.shadowColor = 'rgba(0, 0, 0, 0.45)';
          c.shadowBlur = size * 0.06;
          c.shadowOffsetY = size * 0.03;
        }
        c.fillText(text, 0, 0);
        if (text === '6' || text === '9') c.fillRect(-size * 0.25, size * 0.42, size * 0.5, size * 0.07); // tell 6 from 9
        c.restore();
      }
    }
  });
  const texture = (canvas, srgb) => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: texture(colour, true), bumpMap: texture(bump, false), emissiveMap: texture(glowing, true) };
}

// ---------- the studio the dice reflect ----------

function studio(renderer) {
  const room = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x75757e, side: THREE.BackSide }));
  walls.scale.set(40, 40, 40);
  room.add(walls);
  // Soft boxes: big bright panels above and to the sides make the highlights.
  const panel = (x, y, z, w, h, k, color = 0xffffff) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
    m.position.set(x, y, z);
    m.scale.set(w, h, 0.2);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(-6, 6, 18, 14, 8, 6);
  panel(10, -4, 12, 6, 10, 2.5, 0xdde6ff);
  panel(-12, -8, 8, 5, 5, 1.5, 0xffe2c0);
  panel(0, 14, 6, 20, 3, 1.2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.035).texture;
  pmrem.dispose();
  box.dispose();
  return env;
}

// ---------- sounds ----------

let audio = null;
const sounds = new Map();
async function loadSounds(kind) {
  audio ??= new AudioContext();
  if (!sounds.has(kind)) {
    const n = { plastic: 15, wood: 12, metal: 12 }[kind];
    sounds.set(kind, Promise.all(Array.from({ length: n }, async (_, i) => {
      const res = await fetch(`/vendor/dice/sounds/dicehit/dicehit_${kind}${i + 1}.mp3`);
      return audio.decodeAudioData(await res.arrayBuffer());
    })));
  }
  return sounds.get(kind);
}

// ---------- the roller ----------

export default class DeluxeDice {
  constructor(selector, options = {}) {
    this.container = document.querySelector(selector);
    this.sounds = !!options.sounds;
    this.volume = (options.volume ?? 50) / 100;
    this.theme_customColorset = options.theme_customColorset ?? null;
    this.diceList = [];
    this.materials = new Map();
    this.frame = null;
    let saved = 0;
    try { saved = Number(localStorage.getItem(QUALITY_KEY)) || 0; } catch { /* no storage */ }
    this.tier = Math.min(Math.max(saved, 0), TIERS.length - 1);
  }

  async initialize() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    this.container.append(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.environment = studio(renderer);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x50505c, 0.5));
    const key = (this.key = new THREE.DirectionalLight(0xfff2e0, 2.6));
    key.position.set(-10, 12, 34);
    key.castShadow = true;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.7);
    rim.position.set(14, -10, 8);
    scene.add(rim);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.ground.receiveShadow = true;
    scene.add(this.ground);
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 400);

    this.applyTier();
    this.resize(1);
    // Compile the shaders now (a d20 in the current style), so the first roll doesn't stutter.
    const sample = this.makeDie('d20', 0);
    scene.add(sample);
    await renderer.compileAsync(scene, this.camera);
    scene.remove(sample);
    renderer.render(scene, this.camera);
    // Warm up the physics too (its first run is slower).
    simulate([{ shape: 'd6', value: 1 }], { halfW: 16, halfH: 9 });
    if (this.sounds) loadSounds(this.soundKind()).catch(() => {});
  }

  async updateConfig(config) {
    if ('theme_customColorset' in config) {
      this.theme_customColorset = config.theme_customColorset;
      for (const m of this.materials.values()) {
        for (const t of [m.map, m.bumpMap, m.emissiveMap]) t?.dispose();
        m.dispose();
      }
      this.materials.clear();
    }
  }

  async loadSounds() {
    await loadSounds(this.soundKind());
  }

  soundKind() {
    const t = [].concat(this.theme_customColorset?.texture ?? 'none')[0];
    return TEXTURES[t]?.look === 'metal' ? 'metal' : TEXTURES[t]?.look === 'wood' || this.theme_customColorset?.material === 'wood' ? 'wood' : 'plastic';
  }

  /** The material for die number i of a kind in the current style (made once, then kept). */
  material(kind, i) {
    const set = this.theme_customColorset ?? {};
    const color = pick(set.background ?? '#8b2e2e', i);
    const ink = pick(set.foreground ?? '#ffffff', i);
    const textureName = pick(set.texture ?? 'none', i);
    const key = `${kind}|${color}|${ink}|${textureName}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const style = String(set.name ?? '').replace(/^dndapp-/, '');
    const tex = TEXTURES[textureName];
    const look = tex?.look ?? (set.material === 'wood' ? 'wood' : 'resin');
    const glow = GLOWING.has(style);
    const m = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, bumpScale: 2.2, envMapIntensity: 1 });
    if (look === 'metal') Object.assign(m, { metalness: 0.9, roughness: 0.32, clearcoat: 0.4, envMapIntensity: 1.3 });
    if (look === 'wood') Object.assign(m, { roughness: 0.62, clearcoat: 0.15 });
    if (look === 'ice') Object.assign(m, { roughness: 0.1, transmission: TIERS[this.tier].see ? 0.45 : 0, thickness: 1.5, ior: 1.31 });
    if (look === 'sheen' || GLITTER.has(style)) Object.assign(m, { iridescence: 0.7, iridescenceIOR: 1.6 });
    m.userData.transmission = m.transmission;
    // Textures are drawn once the picture has loaded; until then the plain colour.
    const draw = (image) => {
      const maps = drawAtlas(kind, { color, ink, image, mode: tex?.mode, glow });
      for (const t of [m.map, m.bumpMap, m.emissiveMap]) t?.dispose();
      Object.assign(m, maps);
      if (glow) Object.assign(m, { emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55 });
      m.needsUpdate = true;
    };
    draw(null);
    if (tex) loadImage(textureName).then((img) => img && draw(img));
    this.materials.set(key, m);
    return m;
  }

  makeDie(kind, i) {
    const mesh = new THREE.Mesh(geometryFor(kind), this.material(kind, i));
    mesh.castShadow = TIERS[this.tier].shadow > 0;
    mesh.shape = kind;
    return mesh;
  }

  /** Fit the drawing to the stage; halfH is how much table (up and down from the middle) is in view. */
  resize(halfH) {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIERS[this.tier].ratio));
    const size = r.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) r.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    cam.position.set(0, 0, halfH / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    cam.near = 1;
    cam.far = cam.position.z * 2;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const halfW = halfH * cam.aspect;
    this.ground.scale.set(halfW * 4, halfH * 4, 1);
    const sc = this.key.shadow.camera;
    Object.assign(sc, { left: -halfW - 3, right: halfW + 3, top: halfH + 3, bottom: -halfH - 3, near: 1, far: 90 });
    sc.updateProjectionMatrix();
    return { halfW, halfH };
  }

  applyTier() {
    const tier = TIERS[this.tier];
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.ratio));
    r.shadowMap.enabled = tier.shadow > 0;
    if (tier.shadow) {
      this.key.shadow.mapSize.set(tier.shadow, tier.shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    for (const mesh of this.diceList) mesh.castShadow = tier.shadow > 0;
    for (const m of this.materials.values()) {
      const t = tier.see ? m.userData.transmission ?? 0 : 0;
      if (m.transmission !== t) {
        m.transmission = t;
        m.needsUpdate = true;
      }
    }
    try { localStorage.setItem(QUALITY_KEY, String(this.tier)); } catch { /* no storage */ }
  }

  /** Where a die is now, in page coordinates. */
  screenPosition(mesh) {
    const p = mesh.position.clone().project(this.camera);
    const rect = this.container.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  clearDice() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.finish?.();
    for (const mesh of this.diceList) {
      this.scene.remove(mesh);
      if (mesh.userData.ownMaterial) mesh.material.dispose();
    }
    this.diceList = [];
    this.renderer?.render(this.scene, this.camera);
  }

  roll(notation) {
    this.clearDice();
    const dice = parseForced(notation);
    const { halfW, halfH } = this.resize(9 * Math.max(1, Math.sqrt(dice.length / 10)));
    const throwPlan = simulate(dice, { halfW, halfH });
    const fixes = throwPlan.fixes.map(([w, x, y, z]) => new THREE.Quaternion(x, y, z, w));
    this.diceList = dice.map((d, i) => {
      const mesh = this.makeDie(d.shape, i);
      mesh.getLastValue = () => ({ value: d.value });
      this.scene.add(mesh);
      return mesh;
    });
    const { frames, steps, hits } = throwPlan;
    const a = new THREE.Quaternion();
    const b = new THREE.Quaternion();
    const place = (at) => {
      const i0 = Math.min(Math.floor(at), steps - 1);
      const i1 = Math.min(i0 + 1, steps - 1);
      const t = at - i0;
      const f0 = frames[i0];
      const f1 = frames[i1];
      this.diceList.forEach((mesh, k) => {
        const o = k * 7;
        mesh.position.set(f0[o] + (f1[o] - f0[o]) * t, f0[o + 1] + (f1[o + 1] - f0[o + 1]) * t, f0[o + 2] + (f1[o + 2] - f0[o + 2]) * t);
        a.set(f0[o + 3], f0[o + 4], f0[o + 5], f0[o + 6]);
        b.set(f1[o + 3], f1[o + 4], f1[o + 5], f1[o + 6]);
        mesh.quaternion.slerpQuaternions(a, b, t).multiply(fixes[k]);
      });
    };
    place(0);

    const kind = this.soundKind();
    if (this.sounds && !sounds.has(kind)) loadSounds(kind).catch(() => {}); // this style's sounds: ready from the next roll
    const bank = this.sounds && sounds.get(kind);
    let nextHit = 0;
    let lastSound = 0;
    const play = async (speed) => {
      const buffers = await bank;
      if (!buffers?.length || audio.state === 'closed') return;
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime;
      if (now - lastSound < 0.035) return;
      lastSound = now;
      const src = audio.createBufferSource();
      src.buffer = buffers[Math.floor(Math.random() * buffers.length)];
      src.playbackRate.value = rand(0.92, 1.08);
      const gain = audio.createGain();
      gain.gain.value = Math.min(1, speed / 40) * this.volume;
      src.connect(gain).connect(audio.destination);
      src.start();
    };

    return new Promise((resolve) => {
      const start = performance.now();
      let last = start;
      const times = [];
      this.finish = () => {
        this.finish = null;
        resolve();
      };
      const tick = () => {
        const now = performance.now();
        const at = ((now - start) / 1000) * SPEED / STEP;
        place(at);
        while (bank && nextHit < hits.length && hits[nextHit].step <= at) play(hits[nextHit++].speed);
        this.renderer.render(this.scene, this.camera);
        const dt = now - last;
        last = now;
        if (dt < 250) times.push(dt); // a hidden tab pauses frames: not the device's fault
        if (times.length === 12) this.adapt(times); // a slow device shows few frames per throw: decide early
        if (at >= steps - 1) {
          this.frame = null;
          this.settle(times);
          this.finish?.();
        } else {
          this.frame = requestAnimationFrame(tick);
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  /** Too slow (under ~40 frames a second) over the first frames of a throw: one step down. */
  adapt(times) {
    const avg = times.slice(2).reduce((s, t) => s + t, 0) / (times.length - 2);
    if (avg > 25 && this.tier < TIERS.length - 1) {
      this.tier++;
      this.applyTier();
    }
  }

  /** A whole throw at a comfortable 100+ frames a second: try one step up next time. */
  settle(times) {
    if (times.length < 30 || this.tier === 0) return;
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    if (avg < 9) {
      this.tier--;
      this.applyTier();
    }
  }

  /** Light up a die: a natural 20 (gold), a natural 1 (red) or maxed damage (blue). */
  glow(mesh, kind) {
    if (!this.diceList.includes(mesh)) return;
    const color = { crit: 0xffc23a, fumble: 0xff2020, max: 0x7fd8ff }[kind] ?? 0xffffff;
    const m = mesh.material.clone();
    Object.assign(m, { emissive: new THREE.Color(color), emissiveMap: null, emissiveIntensity: 0 });
    mesh.material = m;
    mesh.userData.ownMaterial = true;
    const start = performance.now();
    const pulse = () => {
      if (!this.diceList.includes(mesh)) return;
      const t = (performance.now() - start) / 1400;
      m.emissiveIntensity = t < 0.15 ? (t / 0.15) * 1.4 : 0.35 + 1.05 * Math.max(0, 1 - (t - 0.15) / 0.85);
      this.renderer.render(this.scene, this.camera);
      if (t < 1 && !this.frame) requestAnimationFrame(pulse);
    };
    requestAnimationFrame(pulse);
  }
}
