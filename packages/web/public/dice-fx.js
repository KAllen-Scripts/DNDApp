/**
 * Special effects for the dice: particles that trail the dice while they roll
 * (embers, snow, sparks...), bursts for a natural 20, a natural 1 and maxed
 * damage, a banner, a shake, and small synthesised chimes. Drawn on one
 * canvas over the page (#dice-fx); nothing is loaded from anywhere.
 * dice.js decides when; this only draws. Nothing here runs with reduced motion.
 */

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Trails: what each dice style gives off while rolling. colors, shape
 * (dot, spark, flake, star, smoke, bubble, petal), size, how long they last
 * (frames), and how they move (rise: up is negative; spread: sideways speed).
 */
export const TRAILS = {
  embers: { colors: ['#ffd36b', '#ff9a2e', '#ff5a1f', '#ffefb0'], shape: 'dot', size: [1.5, 3.5], life: [30, 60], rise: -1.2, spread: 1.2, glow: true },
  snow: { colors: ['#ffffff', '#d8f3ff', '#a9e4ff'], shape: 'flake', size: [3, 6], life: [50, 80], rise: 0.4, spread: 0.8, glow: true },
  sparks: { colors: ['#fff6a8', '#ffd500', '#9be7ff', '#ffffff'], shape: 'spark', size: [6, 14], life: [10, 22], rise: 0, spread: 5, glow: true },
  motes: { colors: ['#ffe9a3', '#fff6d6', '#ffd36b'], shape: 'dot', size: [1.2, 2.6], life: [40, 70], rise: -0.6, spread: 0.6, glow: true },
  stars: { colors: ['#ffffff', '#cfe3ff', '#ffe9ff', '#bba8ff'], shape: 'star', size: [3, 7], life: [30, 60], rise: 0, spread: 0.5, glow: true },
  smoke: { colors: ['#2b3a2b', '#1c241c', '#3d5a3d', '#0f140f'], shape: 'smoke', size: [6, 12], life: [40, 70], rise: -0.5, spread: 0.6, glow: false },
  bubbles: { colors: ['#b5ff6b', '#7dff8f', '#d8ffb0'], shape: 'bubble', size: [2, 5], life: [35, 60], rise: -0.9, spread: 0.6, glow: false },
  glitter: { colors: ['#ff8ad8', '#8ad7ff', '#c6a8ff', '#fff3a8', '#ffffff'], shape: 'star', size: [2, 4.5], life: [20, 45], rise: 0.2, spread: 1.2, glow: true },
  petals: { colors: ['#ffc6e8', '#ffd9c6', '#e5d4ff', '#fff0f6'], shape: 'petal', size: [3, 6], life: [50, 80], rise: 0.6, spread: 1, glow: false },
};

/** One shared canvas and animation loop. */
export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [];
  let flashes = []; // expanding rings and glows
  let running = false;
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  function add(p) {
    particles.push(p);
    if (particles.length > 900) particles.splice(0, particles.length - 900);
    start();
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const f of flashes) drawFlash(f);
    flashes = flashes.filter((f) => ++f.age < f.life);
    for (const p of particles) {
      p.age++;
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += p.vspin;
      drawParticle(p);
    }
    particles = particles.filter((p) => p.age < p.life);
    if (particles.length || flashes.length) requestAnimationFrame(frame);
    else {
      running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawParticle(p) {
    const t = p.age / p.life;
    const alpha = p.shape === 'smoke' ? 0.35 * (1 - t) : t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const size = p.shape === 'smoke' ? p.size * (1 + t * 2) : p.size * (p.shape === 'spark' ? 1 : 1 - t * 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    ctx.translate(p.x, p.y);
    ctx.fillStyle = ctx.strokeStyle = p.color;
    if (p.glow) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = size * 2.5;
    }
    switch (p.shape) {
      case 'spark': {
        const len = Math.hypot(p.vx, p.vy) * 2 + size * 0.4;
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        break;
      }
      case 'flake':
        ctx.rotate(p.spin);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          ctx.rotate(Math.PI / 3);
          ctx.moveTo(-size, 0);
          ctx.lineTo(size, 0);
        }
        ctx.stroke();
        break;
      case 'star':
        ctx.rotate(p.spin);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? size * 0.28 : size;
          ctx.lineTo(Math.cos((i * TAU) / 8) * r, Math.sin((i * TAU) / 8) * r);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'bubble':
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, TAU);
        ctx.stroke();
        break;
      case 'petal':
        ctx.rotate(p.spin);
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.45, 0, 0, TAU);
        ctx.fill();
        break;
      case 'confetti':
        ctx.rotate(p.spin);
        ctx.scale(1, Math.cos(p.age * 0.2 + p.size));
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        break;
      default: // dot and smoke
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
  }

  function drawFlash(f) {
    const t = f.age / f.life;
    ctx.save();
    ctx.globalCompositeOperation = f.mode;
    if (f.kind === 'ring') {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.width * (1 - t) + 1;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * (f.implode ? 1 - t * 0.9 : 0.15 + t), 0, TAU);
      ctx.stroke();
    } else {
      // A soft glow (or, with "screen", a tint over the whole window).
      const r = f.radius * (0.6 + t * 0.6);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, f.color);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = (1 - t) * f.alpha;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    ctx.restore();
  }

  /** A few trail particles at (x, y), for a die that's moving at (vx, vy) on screen. colors replaces the trail's own. */
  function trail(x, y, style, n = 1, vx = 0, vy = 0, colors = null) {
    const s = TRAILS[style];
    if (!s) return;
    for (let i = 0; i < n; i++) {
      add({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-s.spread, s.spread) - vx * 0.08, vy: rand(-s.spread, s.spread) * 0.5 + s.rise - vy * 0.08,
        gravity: s.shape === 'spark' ? 0.15 : 0, drag: s.shape === 'spark' ? 0.9 : 0.98,
        size: rand(...s.size), life: rand(...s.life), age: 0, spin: rand(0, TAU), vspin: rand(-0.08, 0.08),
        color: pick(colors ?? s.colors), shape: s.shape, glow: s.glow,
      });
    }
  }

  /** Particles flying out from (x, y). */
  function burst(x, y, { colors, shape = 'dot', n = 60, speed = 9, size = [2, 4], life = [40, 80], gravity = 0.12, glow = true }) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const v = rand(speed * 0.3, speed);
      add({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25, gravity, drag: 0.965,
        size: rand(...size), life: rand(...life), age: 0, spin: rand(0, TAU), vspin: rand(-0.25, 0.25),
        color: pick(colors), shape, glow,
      });
    }
  }

  const flash = (f) => {
    flashes.push({ age: 0, mode: 'lighter', alpha: 1, width: 8, ...f });
    start();
  };

  return {
    trail,
    /** Natural 20: a golden flash, rings, sparks and confetti. */
    crit(x, y) {
      flash({ kind: 'glow', x, y, radius: 260, color: 'rgba(255, 214, 90, 0.9)', life: 45 });
      flash({ kind: 'ring', x, y, radius: 220, color: '#ffd84a', life: 40 });
      setTimeout(() => flash({ kind: 'ring', x, y, radius: 320, color: '#fff3b0', life: 45, width: 4 }), 120);
      burst(x, y, { colors: ['#ffd84a', '#fff3b0', '#ffb72e', '#ffffff'], shape: 'star', n: 70, speed: 11, size: [3, 7] });
      burst(x, y, { colors: ['#ffd84a', '#ff5ea8', '#5ec8ff', '#7dff9b', '#ffffff', '#c58bff'], shape: 'confetti', n: 90, speed: 13, size: [6, 11], life: [70, 120], gravity: 0.22, glow: false });
    },
    /** Natural 1: a red flash that closes in, and smoke. */
    fumble(x, y) {
      flash({ kind: 'glow', x: innerWidth / 2, y: innerHeight / 2, radius: Math.max(innerWidth, innerHeight), color: 'rgba(160, 0, 0, 0.55)', life: 40, mode: 'source-over', alpha: 0.6 });
      flash({ kind: 'ring', x, y, radius: 240, color: '#ff3b3b', life: 35, implode: true, mode: 'source-over' });
      burst(x, y, { colors: ['#2a2a2a', '#3b2323', '#1a1a1a', '#4a3a3a'], shape: 'smoke', n: 26, speed: 3, size: [8, 16], life: [50, 90], gravity: -0.04, glow: false });
      burst(x, y, { colors: ['#ff4a3b', '#a31212'], shape: 'spark', n: 24, speed: 8, size: [6, 12], life: [14, 26], gravity: 0.3 });
    },
    /** Every die on its highest face. */
    max(x, y) {
      flash({ kind: 'ring', x, y, radius: 160, color: '#9be7ff', life: 35 });
      burst(x, y, { colors: ['#ffffff', '#9be7ff', '#ffd84a'], shape: 'star', n: 40, speed: 8, size: [2, 5] });
    },
  };
}

/** A big word over the page for a moment ("Natural 20!"). */
export function banner(layer, text, kind) {
  const el = document.createElement('div');
  el.className = `fx-banner ${kind}`;
  el.textContent = text;
  layer.append(el);
  el.addEventListener('animationend', () => el.remove());
}

/** Shake what's on the page (not the dice or the result). */
export function shake() {
  for (const panel of document.querySelectorAll('#app-view > .panel:not([hidden]), #app-view > .topbar')) {
    panel.classList.remove('fx-shake');
    void panel.offsetWidth; // restart the animation
    panel.classList.add('fx-shake');
    panel.addEventListener('animationend', () => panel.classList.remove('fx-shake'), { once: true });
  }
}

let audio = null;
/** Small synthesised sounds: a rising chime for a natural 20, a low thud for a natural 1, a twinkle for max. */
export function chime(kind) {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    const notes = { crit: [523.25, 659.25, 783.99, 1046.5], max: [880, 1318.5], fumble: [110, 82.4] }[kind];
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === 'fumble' ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      const start = now + i * (kind === 'fumble' ? 0.12 : 0.09);
      const length = kind === 'fumble' ? 0.5 : 0.7;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === 'fumble' ? 0.12 : 0.09, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + length + 0.05);
    });
  } catch { /* no audio: fine */ }
}
