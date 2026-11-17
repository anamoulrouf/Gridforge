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
