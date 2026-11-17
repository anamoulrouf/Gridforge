// Procedural canvas textures (no external assets).
import * as THREE from 'three';
import { rng } from '../sim/rng.js';

const cache = {};

export function glowTexture() {
  if (cache.glow) return cache.glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (cache.glow = t);
}

export function poolTexture() {
  if (cache.pool) return cache.pool;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (cache.pool = t);
}

export function groundTexture() {
  if (cache.ground) return cache.ground;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2c3b';
  g.fillRect(0, 0, S, S);
  const r = rng(99);
  for (let i = 0; i < 2600; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 2 + r() * 14;
    const l = 20 + r() * 22;
    g.fillStyle = `hsla(${200 + r() * 30}, ${18 + r() * 14}%, ${l}%, ${0.05 + r() * 0.08})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${150 + r() * 60},${180 + r() * 50},${200 + r() * 40},${0.03 + r() * 0.04})`;
    g.fillRect(r() * S, r() * S, 1, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (cache.ground = t);
}

export function signTexture(text, color = '#e8f4ff', bg = 'rgba(0,0,0,0)') {
  const key = 'sign:' + text + color;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.font = '700 74px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (cache[key] = t);
}

export function crossTexture() {
  if (cache.cross) return cache.cross;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(44, 12, 40, 104);
  g.fillRect(12, 44, 104, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (cache.cross = t);
}

// ---------------------------------------------------------------- diorama textures (warm toy style)
function canvasTex(key, w, h, draw, opts = {}) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return (cache[key] = t);
}

/** Mottled lawn: soft lighter/darker blotches and fine blades. White-balanced so material colour tints it. */
export function grassTexture() {
  return canvasTex('grass', 512, 512, (g, S) => {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, S, S);
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      const x = r() * S, y = r() * S, rad = 10 + r() * 46;
      const l = r() < 0.5 ? 255 : 150;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${l},${l},${l},${0.08 + r() * 0.08})`);
      grd.addColorStop(1, `rgba(${l},${l},${l},0)`);
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 14000; i++) {
      const v = 170 + r() * 85;
      g.fillStyle = `rgba(${v},${v},${v},${0.12 + r() * 0.12})`;
      g.fillRect(r() * S, r() * S, 1, 2 + r() * 2);
    }
  }, { repeat: true });
}

/** Soil cross-section for the diorama edge: horizontal strata with pebbles. */
export function soilTexture() {
  return canvasTex('soil', 256, 256, (g, S) => {
    const bands = ['#7a5232', '#6c4629', '#5e3c23', '#53351f'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = bands[i];
      g.fillRect(0, (i * S) / 4, S, S / 4 + 1);
    }
    const r = rng(11);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${40 + r() * 50},${28 + r() * 30},${18 + r() * 20},${0.35 + r() * 0.3})`;
      g.beginPath();
      g.ellipse(r() * S, r() * S, 2 + r() * 6, 1.5 + r() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: true });
}

/** Sign plate with text (painted board look). */
export function plateTexture(text, fg = '#5a2e1a', bg = '#f3e6c8', w = 512, h = 128) {
  return canvasTex(`plate:${text}:${fg}:${bg}`, w, h, (g) => {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 18);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 6;
    g.stroke();
    g.font = `800 ${Math.floor(h * 0.56)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function clockTexture() {
  return canvasTex('clock', 128, 128, (g) => {
    g.fillStyle = '#5a3a22';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f6efdf';
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a2a1c';
    g.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
      g.lineTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
      g.stroke();
    }
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64, 30);
    g.moveTo(64, 64);
    g.lineTo(88, 72);
    g.stroke();
  });
}

/** Striped awning canvas. */
export function stripeTexture(a, b) {
  return canvasTex(`stripe:${a}:${b}`, 128, 32, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 16, 0, 16, 32);
    }
  });
}

/** Yellow hazard triangle with a lightning bolt. */
export function hazardTexture() {
  return canvasTex('hazard', 128, 128, (g) => {
    g.fillStyle = '#2a2016';
    g.beginPath();
    g.moveTo(64, 6);
    g.lineTo(124, 118);
    g.lineTo(4, 118);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffc531';
    g.beginPath();
    g.moveTo(64, 20);
    g.lineTo(112, 110);
    g.lineTo(16, 110);
    g.closePath();
    g.fill();
    g.fillStyle = '#2a2016';
    g.beginPath();
    g.moveTo(70, 42);
    g.lineTo(52, 78);
    g.lineTo(66, 78);
    g.lineTo(58, 102);
    g.lineTo(80, 66);
    g.lineTo(66, 66);
    g.closePath();
    g.fill();
  });
}

/** Ribbed roller door / corrugated metal. */
export function ribTexture(base = '#9aa1a6') {
  return canvasTex('rib:' + base, 64, 64, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, y, 64, 2);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(0, y + 2, 64, 1);
    }
  });
}
