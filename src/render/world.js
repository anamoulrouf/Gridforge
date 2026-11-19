// Static world in the warm "toy diorama" style of reso/graphic: the district sits on a rounded
// grass tile with a soil edge floating in a dark void; chunky gable-roofed buildings, round
// trees and conifers, asphalt roads with white dashes, and satellite islands (wind farm, power
// station, neighbouring town, lake, farm) that preview later stages.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../sim/rng.js';
import { rectDist } from '../sim/grid.js';
import { poolTexture, grassTexture, soilTexture, plateTexture, clockTexture, stripeTexture, hazardTexture, ribTexture, crossTexture, roofTileTexture, pvTexture } from './textures.js';

const WARM = new THREE.Color(2.6, 1.45, 0.6); // HDR window light (blooms at night)
const WARM_SOFT = new THREE.Color(1.8, 1.05, 0.45);
const GLASS_DAY = new THREE.Color('#5b7a90');
const GLASS_NIGHT = new THREE.Color(0.016, 0.018, 0.024);
const WARM_DIM = new THREE.Color();

export const TILE = { half: 224, radius: 48, depth: 18 };

const PAL = {
  grass: '#64913a',
  grassDark: '#4c7a2a',
  road: '#4a4b4f',
  walk: '#d9c7a1',
  mark: '#f3efe4',
  walls: ['#f0e2c2', '#e8c78f', '#efc39a', '#d9e0d2', '#c9d6dc', '#f2d9b0'],
  brick: '#b5563b',
  roofs: ['#d4612d', '#c8502b', '#e07a3a', '#b9472c', '#cf6a33'],
  wood: '#7a5133',
  woodDark: '#5c3b24',
  cream: '#f4ead6',
  steel: '#a7adb2',
  concrete: '#c4bdb0',
};

export function createWorld(scene, map) {
  const root = new THREE.Group();
  scene.add(root);
  const R = rng(2024);

  // ---------------------------------------------------------------- material + geometry caches
  const mats = {};
  const mat = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    return (mats[k] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o }));
  };
  const tileTex = roofTileTexture();
  const roofMats = {};
  /** Terracotta-style tiled roof material (cached by colour). */
  const roof = (color) => (roofMats[color] ||= new THREE.MeshStandardMaterial({ color, map: tileTex, roughness: 0.72 }));
  const geos = {};
  const rbox = (w, h, d, r = 0.35) => {
    const rr = Math.max(0.02, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
    const k = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${rr.toFixed(2)}`;
    return (geos[k] ||= new RoundedBoxGeometry(w, h, d, 2, rr));
  };
  const block = (parent, w, h, d, material, x, y, z, o = {}) => {
    const m = new THREE.Mesh(rbox(w, h, d, o.r ?? 0.35), material);
    m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry;
    m.castShadow = o.cast !== false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cyl = (parent, rt, rb, h, material, x, y, z, seg = 14) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const plane = (parent, w, h, material, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  };

  /** Gable roof on a w×d box whose walls top out at wallH: triangular wall-coloured gable fill,
   *  two overhanging roof slabs and a ridge cap. Ridge runs along local x. Returns roof top y. */
  function gable(parent, w, d, wallH, rise, wallMat, roofMat, oh = 0.7, t = 0.45) {
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const fillGeo = new THREE.ExtrudeGeometry(tri, { depth: w - 0.2, bevelEnabled: false });
    const fill = new THREE.Mesh(fillGeo, wallMat);
    fill.rotation.y = Math.PI / 2;
    fill.position.set(-(w - 0.2) / 2, wallH - 0.05, 0);
    fill.castShadow = true;
    fill.receiveShadow = true;
    parent.add(fill);
    const a = Math.atan2(rise, d / 2);
    const run = d / 2 + oh;
    const slabW = run / Math.cos(a);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(rbox(w + oh * 2, t, slabW, 0.16), roofMat);
      const cz = (s * run) / 2;
      const cy = wallH + rise - (run / 2) * Math.tan(a) + t / 2;
      m.position.set(0, cy, cz);
      m.rotation.x = s * a;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
    }
    const cap = new THREE.Mesh(rbox(w + oh * 2 + 0.1, 0.4, 0.7, 0.18), roofMat);
    cap.position.set(0, wallH + rise + t * 0.9, 0);
    parent.add(cap);
    return wallH + rise + t;
  }

  // ---------------------------------------------------------------- the diorama tile
  function roundedRect(w, d, r) {
    const s = new THREE.Shape();
    const x0 = -w / 2;
    const y0 = -d / 2;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + d - r);
    s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
    s.lineTo(x0 + r, y0 + d);
    s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  }
  const grassTex = grassTexture();
  const soilTex = soilTexture();
  /** Rounded grass slab with a soil skirt, top surface at y=top. */
  function island(parent, cx, cz, w, d, r, top, depth, grassColor = PAL.grass) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    parent.add(g);
    const shape = roundedRect(w, d, r);
    const lip = 1.6;
    const bt = 0.7;
    const grassGeo = new THREE.ExtrudeGeometry(shape, { depth: lip, bevelEnabled: true, bevelThickness: bt, bevelSize: 1.0, bevelSegments: 3, curveSegments: 18 });
    const gt = grassTex.clone();
    gt.needsUpdate = true;
    gt.repeat.set(1 / 34, 1 / 34);
    const grassTop = new THREE.MeshStandardMaterial({ color: grassColor, map: gt, roughness: 1 });
    const grassSide = new THREE.MeshStandardMaterial({ color: PAL.grassDark, roughness: 1 });
    const gm = new THREE.Mesh(grassGeo, [grassTop, grassSide]);
    gm.rotation.x = -Math.PI / 2;
    gm.position.y = top - lip - bt;
    gm.receiveShadow = true;
    g.add(gm);
    const soilGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.6, bevelSegments: 2, curveSegments: 18 });
    const st = soilTex.clone();
    st.needsUpdate = true;
    st.repeat.set(1 / 40, 1 / depth);
    const sm = new THREE.Mesh(soilGeo, [new THREE.MeshStandardMaterial({ color: '#3a2716', roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#ffffff', map: st, roughness: 1 })]);
    sm.rotation.x = -Math.PI / 2;
    sm.position.y = top - lip - bt - depth - 0.2;
    g.add(sm);
    return g;
  }
  const mt = map.tile || {};
  const T = { cx: mt.cx ?? 0, cz: mt.cz ?? 0, hw: mt.hw ?? TILE.half, hd: mt.hd ?? TILE.half, radius: mt.radius ?? TILE.radius, depth: mt.depth ?? TILE.depth };
  T.half = Math.max(T.hw, T.hd);
  island(root, T.cx, T.cz, T.hw * 2, T.hd * 2, T.radius, 0, T.depth, map.desert ? '#d8b878' : map.ground || PAL.grass);

  // service-area boundary (subtle cream dashes on the lawn)
  {
    const b = map.bounds;
    const pts = [new THREE.Vector3(b.minX, 0.06, b.minZ), new THREE.Vector3(b.maxX, 0.06, b.minZ), new THREE.Vector3(b.maxX, 0.06, b.maxZ), new THREE.Vector3(b.minX, 0.06, b.maxZ), new THREE.Vector3(b.minX, 0.06, b.minZ)];
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#fff4d6', dashSize: 4, gapSize: 5, transparent: true, opacity: 0.35 }));
    l.computeLineDistances();
    root.add(l);
  }

  // ---------------------------------------------------------------- roads (asphalt, sidewalks, white dashes)
  const roadMat = mat(PAL.road, { roughness: 0.95 });
  const walkMat = mat(PAL.walk, { roughness: 1 });
  const markMat = new THREE.MeshBasicMaterial({ color: PAL.mark });
  const marks = [];
  const clampLen = (r) => {
    // keep roads on the tile
    if (r.w > r.d) {
      const x0 = Math.max(r.x - r.w / 2, T.cx - T.hw + 2);
      const x1 = Math.min(r.x + r.w / 2, T.cx + T.hw - 2);
      return { ...r, x: (x0 + x1) / 2, w: x1 - x0 };
    }
    const z0 = Math.max(r.z - r.d / 2, T.cz - T.hd + 2);
    const z1 = Math.min(r.z + r.d / 2, T.cz + T.hd - 2);
    return { ...r, z: (z0 + z1) / 2, d: z1 - z0 };
  };
  for (const r0 of map.roads) {
    const r = clampLen(r0);
    block(root, r.w + 3.2, 0.22, r.d + 3.2, walkMat, r.x, 0.11, r.z, { r: 0.1, cast: false });
    block(root, r.w, 0.3, r.d, roadMat, r.x, 0.15, r.z, { r: 0.08, cast: false });
    const lane = r.lanes ?? (r.id === 'main' || r.id === 'cross');
    if (lane) {
      const along = r.w > r.d;
      const len = along ? r.w : r.d;
      const others = map.roads.filter((o) => o !== r0 && (o.lanes ?? (o.id === 'main' || o.id === 'cross')));
      for (let s = -len / 2 + 3; s < len / 2 - 3; s += 7) {
        const x = along ? r.x + s : r.x;
        const z = along ? r.z : r.z + s;
        if (others.some((o) => rectDist(x, z, o) < 4)) continue;
        marks.push({ x, z, along, w: 3, h: 0.32 });
      }
    }
  }
  // water: river / sea with sandy banks (bridges are simply the road decks crossing above)
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f7fa3', roughness: 0.18, metalness: 0.1 });
  for (const w of map.water || []) {
    block(root, w.w + 6, 0.12, w.d + 6, mat('#d9c08c'), w.x, 0.05, w.z, { r: 0.4, cast: false });
    block(root, w.w, 0.2, w.d, waterMat, w.x, 0.1, w.z, { r: 0.3, cast: false });
    for (const r of map.roads) {
      if (rectDist(w.x, w.z, { x: r.x, z: r.z, w: r.w + w.w, d: r.d + w.d }) > 0) continue;
      const along = r.w > r.d;
      const bx = along ? w.x : r.x;
      const bz = along ? r.z : w.z;
      const L = (along ? w.w : w.d) + 8;
      for (const sd of [-1, 1]) block(root, along ? L : 0.5, 1.0, along ? 0.5 : L, mat('#e9e0cc'), bx + (along ? 0 : sd * (r.w / 2 + 0.6)), 0.8, bz + (along ? sd * (r.d / 2 + 0.6) : 0), { r: 0.15 });
    }
  }
  // railway: a gravel bed with two rails and sleepers (Highvale)
  if (map.rail) {
    const r = map.rail;
    const along = r.w > r.d;
    const len = Math.min(along ? r.w : r.d, (along ? T.hw : T.hd) * 2 - 6);
    block(root, along ? len : 6, 0.25, along ? 6 : len, mat('#9a948a', { roughness: 1 }), r.x, 0.13, r.z, { r: 0.05, cast: false });
    for (const o of [-0.9, 0.9]) block(root, along ? len : 0.18, 0.2, along ? 0.18 : len, mat('#6d6f72', { metalness: 0.5, roughness: 0.4 }), r.x + (along ? 0 : o), 0.38, r.z + (along ? o : 0), { r: 0.02, cast: false });
    const sl = [];
    for (let s0 = -len / 2 + 1; s0 < len / 2; s0 += 2.2) sl.push(s0);
    const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(along ? 0.5 : 3, 0.12, along ? 3 : 0.5), mat('#5a4636'), sl.length);
    sl.forEach((s0, i) => sm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(r.x + (along ? s0 : 0), 0.3, r.z + (along ? 0 : s0))));
    root.add(sm);
  }
  // gentle hills (wind ridge, headlands)
  for (const hl of map.hills || []) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      pts.push(new THREE.Vector2(hl.r * f, hl.h * Math.cos((f * Math.PI) / 2) ** 2));
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 32), new THREE.MeshStandardMaterial({ color: hl.color || (map.desert ? '#d9b97c' : PAL.grass), map: map.desert ? null : grassTex, roughness: 1 }));
    m.scale.z = hl.squash ?? 1;
    m.position.set(hl.x, 0, hl.z);
    m.receiveShadow = true;
    m.castShadow = true;
    root.add(m);
    if (hl.snow) {
      // snow cap: the top 45% of the peak
      const cap = [];
      for (let i = 0; i <= 8; i++) {
        const f = (i / 8) * 0.55;
        cap.push(new THREE.Vector2(hl.r * f, hl.h * Math.cos((f * Math.PI) / 2) ** 2 + 0.25));
      }
      const sm = new THREE.Mesh(new THREE.LatheGeometry(cap.reverse(), 32), new THREE.MeshStandardMaterial({ color: '#f3f6f8', roughness: 0.7 }));
      sm.scale.z = hl.squash ?? 1;
      sm.position.set(hl.x, 0, hl.z);
      sm.castShadow = true;
      root.add(sm);
    }
  }
  // zebra crossings at junctions
  for (const [cx, cz, along] of map.crossings ?? [[40, -7.5, false], [40, 7.5, false], [31.5, 0, true], [48.5, 0, true]]) {
    for (let i = -3; i <= 3; i++) marks.push({ x: along ? cx : cx + i * 1.0, z: along ? cz + i * 1.1 : cz, along, w: 2.4, h: 0.5, zebra: true });
  }
  {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), markMat, marks.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    marks.forEach((k, i) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, k.along ? 0 : Math.PI / 2));
      m4.compose(new THREE.Vector3(k.x, 0.31, k.z), q, new THREE.Vector3(k.w, k.h, 1));
      im.setMatrixAt(i, m4);
    });
    root.add(im);
  }

  // ---------------------------------------------------------------- lights registry (windows / bulbs)
  const lights = []; // { g, mesh:'win'|'bulb', idx, thr, lit, color }
  const winXf = [];
  const bulbXf = [];
  const groups = {};
  const ensureGroup = (id, center, height) => (groups[id] ||= { id, level: 0, target: 0, partial: false, pools: [], signs: [], center, height });

  let winMesh = null;
  let bulbMesh = null;
  let frameMesh = null;
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  function addWindow(gid, pos, rotY, w, h, thr) {
    if (winMesh && winXf.length >= winMesh.instanceMatrix.count) return;
    winXf.push({ pos, rotY, w, h });
    if (winMesh) {
      const i = winXf.length - 1;
      _q.setFromEuler(new THREE.Euler(0, rotY, 0));
      _m4.compose(pos.clone().add(new THREE.Vector3(0, 0, -0.03).applyQuaternion(_q)), _q, new THREE.Vector3(w + 0.42, h + 0.42, 1));
      frameMesh.setMatrixAt(i, _m4);
      _m4.compose(pos, _q, new THREE.Vector3(w, h, 1));
      winMesh.setMatrixAt(i, _m4);
      winMesh.count = frameMesh.count = winXf.length;
      winMesh.instanceMatrix.needsUpdate = frameMesh.instanceMatrix.needsUpdate = true;
    }
    lights.push({ g: gid, mesh: 'win', idx: winXf.length - 1, thr, lit: R() < 0.84, color: R() < 0.25 ? WARM_SOFT : WARM });
  }
  function addBulb(gid, pos, size, thr, color = WARM) {
    if (bulbMesh && bulbXf.length >= bulbMesh.instanceMatrix.count) return;
    bulbXf.push({ pos, size });
    if (bulbMesh) {
      const i = bulbXf.length - 1;
      _m4.compose(pos, _q.identity(), new THREE.Vector3(size, size, size));
      bulbMesh.setMatrixAt(i, _m4);
      bulbMesh.setColorAt(i, GLASS_NIGHT);
      bulbMesh.count = bulbXf.length;
      bulbMesh.instanceMatrix.needsUpdate = true;
    }
    lights.push({ g: gid, mesh: 'bulb', idx: bulbXf.length - 1, thr, lit: true, color });
  }
  // Ground light pools: one additive instanced mesh. Additive blending makes
  // "colour × opacity" equivalent to fading, so per-pool fades are instance colours.
  let poolMesh = null;
  const poolXf = [];
  const _poolQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const _poolV = new THREE.Vector3();
  const _poolS = new THREE.Vector3();
  const _poolC = new THREE.Color();
  function placePool(r) {
    _m4.compose(_poolV.set(r.x, 0.36, r.z), _poolQ, _poolS.set(r.size, r.size, 1));
    poolMesh.setMatrixAt(r.idx, _m4);
    poolMesh.setColorAt(r.idx, _poolC.setRGB(0, 0, 0));
  }
  function addPool(gid, x, z, size, color = '#ffb36b', opacity = 0.5) {
    if (poolMesh && poolXf.length >= poolMesh.instanceMatrix.count) return;
    const r = { x, z, size, color: new THREE.Color(color), maxOpacity: opacity, idx: poolXf.length };
    poolXf.push(r);
    if (poolMesh) {
      placePool(r);
      poolMesh.count = poolXf.length;
      poolMesh.instanceMatrix.needsUpdate = true;
      poolMesh.instanceColor.needsUpdate = true;
    }
    groups[gid].pools.push(r);
  }

  /** Windows on a box's facades, given in the building group's local frame.
   *  skip(face, lx, floor) → true to leave a gap (doors, porticos). */
  function facadeWindows(gid, grp, w, d, wallH, floors, perFront, perSide, ww = 1.3, wh = 1.25, skip = () => false, y0 = 0) {
    grp.updateMatrixWorld(true);
    const fh = (wallH - y0) / floors;
    const local = [];
    for (let f = 0; f < floors; f++) {
      const y = y0 + fh * f + fh * 0.55;
      for (let i = 0; i < perFront; i++) {
        const x = -w / 2 + (w / perFront) * (i + 0.5);
        if (!skip('front', x, f)) local.push([x, y, d / 2 + 0.07, 0]);
        if (!skip('back', x, f)) local.push([x, y, -d / 2 - 0.07, Math.PI]);
      }
      for (let i = 0; i < perSide; i++) {
        const z = -d / 2 + (d / perSide) * (i + 0.5);
        if (!skip('side', z, f)) {
          local.push([w / 2 + 0.07, y, z, Math.PI / 2]);
          local.push([-w / 2 - 0.07, y, z, -Math.PI / 2]);
        }
      }
    }
    const n = local.length;
    local.forEach(([x, y, z, ry], i) => {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(grp.matrixWorld);
      addWindow(gid, p, ry + grp.rotation.y, ww, wh, (((i * 7919) % n) / n) * 0.85 + 0.05);
    });
  }

  // ---------------------------------------------------------------- customer buildings
  const bushSpots = [];
  const facing = (c, squareOnly) => {
    let best = null;
    for (const r of map.roads) {
      if (r.id !== 'main' && r.id !== 'cross') continue;
      const d = rectDist(c.x, c.z, r);
      if (!best || d < best.d) best = { d, r };
    }
    if (!squareOnly && best.r.id === 'cross') best = { r: map.roads.find((r) => r.id === 'main') };
    if (best.r.id === 'main') return c.z < 0 ? 0 : Math.PI;
    return c.x > best.r.x ? -Math.PI / 2 : Math.PI / 2;
  };
  const walkPath = (c, yaw, depth) => {
    // a beige footpath from the front door toward the road, if nothing is in the way
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const start = new THREE.Vector3(c.x, 0, c.z).addScaledVector(dir, depth / 2);
    let len = 0;
    for (let s = 0.5; s < 40; s += 0.5) {
      const p = start.clone().addScaledVector(dir, s);
      if (map.roads.some((r) => rectDist(p.x, p.z, r) < 1.6)) {
        len = s;
        break;
      }
      if (map.customers.some((o) => o !== c && rectDist(p.x, p.z, o) < 1.5)) return;
    }
    if (len < 1) return;
    const mid = start.clone().addScaledVector(dir, len / 2);
    block(root, 1.8, 0.16, len, walkMat, mid.x, 0.08, mid.z, { ry: yaw, r: 0.06, cast: false });
  };


  /** Flat roof with a parapet ring and a darker deck (no coplanar faces). */
  function flatRoof(g, w, d, top, para = '#e9e2d4', deck = '#8f8a80') {
    const pm = mat(para);
    block(g, w + 0.4, 0.9, 0.5, pm, 0, top + 0.4, d / 2 - 0.05, { r: 0.15 });
    block(g, w + 0.4, 0.9, 0.5, pm, 0, top + 0.4, -d / 2 + 0.05, { r: 0.15 });
    block(g, 0.5, 0.9, d, pm, w / 2 - 0.05, top + 0.4, 0, { r: 0.15 });
    block(g, 0.5, 0.9, d, pm, -w / 2 + 0.05, top + 0.4, 0, { r: 0.15 });
    block(g, w - 0.4, 0.14, d - 0.4, mat(deck, { roughness: 1 }), 0, top + 0.05, 0, { r: 0.04, cast: false });
  }
  /** Rooftop solar for prosumer homes/buildings (GDD §8.6): a neat array of framed modules that
   *  fits the roof it sits on, a rail frame, and an inverter on the side wall. Built as its own
   *  group (hidden until the street joins the solar programme) and merged into one draw call. */
  const pvModule = new THREE.MeshStandardMaterial({ map: pvTexture(), roughness: 0.28, metalness: 0.35 });
  const pvRail = new THREE.MeshStandardMaterial({ color: '#aeb5bf', roughness: 0.4, metalness: 0.6 });
  const pvBox = new THREE.MeshStandardMaterial({ color: '#e4e7ea', roughness: 0.6 });
  const pvLed = new THREE.MeshStandardMaterial({ color: '#3ad16b', emissive: '#3ad16b', emissiveIntensity: 1.2 });
  const pvGeo = new THREE.BoxGeometry(1, 0.09, 1);
  function pvArray(parent, W, L, cols, rows, y) {
    const pw = W / cols;
    const ph = L / rows;
    block(parent, W + 0.16, 0.08, L + 0.16, pvRail, 0, y - 0.07, 0, { r: 0.03, cast: false });
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const m = new THREE.Mesh(pvGeo, pvModule);
        m.scale.set(pw - 0.07, 1, ph - 0.07);
        m.position.set(-W / 2 + pw * (i + 0.5), y, -L / 2 + ph * (j + 0.5));
        m.receiveShadow = true;
        parent.add(m);
      }
    }
  }
  function rooftopPV(c, g, height) {
    const pv = new THREE.Group();
    pv.name = 'pv';
    g.add(pv);
    const R0 = g.userData.roof;
    if (R0) {
      // pitched roof: modules on the street-facing slope, clear of the ridge and the eaves
      const a = Math.atan2(R0.rise, R0.d / 2);
      const run = R0.d / 2 + R0.oh;
      const slabW = run / Math.cos(a);
      const slope = new THREE.Group();
      slope.position.set(0, R0.eave + R0.rise - (run / 2) * Math.tan(a) + R0.t / 2, run / 2);
      slope.rotation.x = a;
      pv.add(slope);
      const z0 = -slabW / 2 + 0.75;
      const z1 = slabW / 2 - R0.oh / Math.cos(a) + 0.05;
      const W = R0.w - 1.1;
      const L = z1 - z0;
      const cols = Math.max(2, Math.round(W / 1.1));
      const rows = Math.max(1, Math.round(L / 1.7));
      const arr = new THREE.Group();
      arr.position.z = (z0 + z1) / 2;
      slope.add(arr);
      pvArray(arr, W, L, cols, rows, R0.t / 2 + 0.12);
      // inverter and conduit on the side wall
      const sx = R0.w / 2 + 0.12;
      block(pv, 0.22, 1.1, 0.8, pvBox, sx, 1.6, R0.d * 0.2, { r: 0.05 });
      block(pv, 0.06, 0.12, 0.12, pvLed, sx + 0.12, 1.95, R0.d * 0.2 - 0.22, { r: 0.02, cast: false });
      block(pv, 0.1, R0.eave - 2.1, 0.1, pvRail, sx, 2.15 + (R0.eave - 2.1) / 2, R0.d * 0.2 + 0.25, { r: 0.03, cast: false });
    } else {
      // flat roof: tilted rows that fit the roof deck
      const W = Math.min(c.w - 3, 10);
      const rowsN = Math.max(1, Math.min(3, Math.floor((c.d - 3) / 2.8)));
      for (let k = 0; k < rowsN; k++) {
        const row = new THREE.Group();
        row.position.set(0, height + 0.55, -((rowsN - 1) * 2.8) / 2 + k * 2.8);
        row.rotation.x = -0.4;
        pv.add(row);
        pvArray(row, W, 1.9, Math.max(2, Math.round(W / 1.1)), 1, 0);
      }
    }
    pv.visible = false;
    return pv;
  }
  /** Builders for the customer types introduced by Stages 2–5. Returns the building height. */
  function buildExtra(c, g) {
    const yaw = facing(c, c.w === c.d);
    g.rotation.y = c.yaw ?? yaw;
    const w = c.w - 0.8;
    const d = c.d - 0.8;
    const pad = (col = PAL.concrete) => block(g, w + 0.6, 0.4, d + 0.6, mat(col), 0, 0.2, 0, { r: 0.12, cast: false });
    const sign = (text, y, z, fg = '#5a2e1a', bg = '#f3e6c8', sw = 4.4) => plane(g, sw, sw * 0.25, new THREE.MeshStandardMaterial({ map: plateTexture(text, fg, bg), emissive: '#ffffff', emissiveMap: plateTexture(text, fg, bg), emissiveIntensity: 0 }), 0, y, z);
    let height = 6;
    switch (c.look || c.type) {
      case 'lowincome': {
        // terrace row: three joined cottages under one roof
        const wallH = 3.6;
        pad();
        const tones = ['#e7d7b8', '#dcc6a0', '#e9cfa9'];
        for (let i = 0; i < 3; i++) {
          block(g, w / 3 + 0.02, wallH, d, mat(tones[i]), -w / 3 + (i * w) / 3, wallH / 2 + 0.3, 0, { r: 0.12 });
          block(g, 1.0, 2.0, 0.22, mat(PAL.woodDark), -w / 3 + (i * w) / 3 - 0.8, 1.3, d / 2 + 0.05, { r: 0.06, cast: false });
          block(g, 0.7, 1.8, 0.7, mat(PAL.brick), -w / 3 + (i * w) / 3 + 0.9, wallH + 2.4, -d * 0.15, { r: 0.08 });
        }
        height = gable(g, w, d, wallH + 0.3, 2.2, mat(tones[0]), roof('#a9533a'), 0.6);
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d, wallH + 0.3, 1, 3, 1, 1.0, 1.0, (face, lx) => face === 'front' && false, 0.3);
        addPool(c.id, c.x, c.z, 22, '#ffb36b', 0.14);
        walkPath(c, g.rotation.y, d);
        break;
      }
      case 'shop': {
        const wallH = 4.2;
        pad('#d8c39b');
        const tone = ['#f2d9b0', '#e8c78f', '#d9e0d2', '#efc39a'][c.id.length % 4];
        block(g, w, wallH, d, mat(tone), 0, wallH / 2 + 0.3, 0, { r: 0.3 });
        flatRoof(g, w, d, wallH + 0.3);
        const glassM = new THREE.MeshStandardMaterial({ color: '#5b7a90', roughness: 0.15, metalness: 0.2, emissive: '#ffb050', emissiveIntensity: 0 });
        const shopWin = plane(g, w * 0.7, 2.2, glassM, -0.4, 1.7, d / 2 + 0.06);
        const aw = new THREE.Mesh(rbox(w * 0.9, 0.14, 1.6, 0.05), new THREE.MeshStandardMaterial({ map: stripeTexture(...[['#d9443a', '#f6efe2'], ['#3f8f6b', '#f6efe2'], ['#3d6fa8', '#f6efe2'], ['#e9862c', '#f6efe2']][c.id.length % 4]), roughness: 0.8 }));
        aw.position.set(0, 3.25, d / 2 + 0.8);
        aw.rotation.x = 0.35;
        aw.castShadow = true;
        g.add(aw);
        ensureGroup(c.id, new THREE.Vector3(c.x, wallH + 1, c.z), wallH + 1);
        groups[c.id].signs.push({ mesh: shopWin, emissive: 0.9 });
        const sg = sign(c.label || 'SHOP', 4.0, d / 2 + 0.1, '#5a2e1a', '#f3e6c8', 3.6);
        groups[c.id].signs.push({ mesh: sg, emissive: 0.7 });
        facadeWindows(c.id, g, w, d, wallH + 0.3, 1, 0, 2, 1.1, 1.0, () => false, 0.3);
        addPool(c.id, c.x, c.z + 2, 18, '#ffc58a', 0.2);
        height = wallH + 1.2;
        break;
      }
      case 'office':
      case 'apartment':
      case 'tower': {
        const floors = c.floors || (c.type === 'tower' ? 12 : c.type === 'apartment' ? 5 : 4);
        const fh = c.type === 'tower' ? 3.4 : 3.1;
        const wallH = floors * fh;
        pad();
        const wallC = c.type === 'tower' ? '#9fb5c4' : c.type === 'apartment' ? ['#efe2c4', '#e8c78f', '#d9e0d2', '#f2d9b0'][c.id.length % 4] : '#e9e2d4';
        block(g, w, wallH, d, mat(wallC, c.type === 'tower' ? { roughness: 0.35, metalness: 0.15 } : {}), 0, wallH / 2 + 0.3, 0, { r: 0.35 });
        for (let f = 1; f < floors; f++) if (c.type !== 'tower' || f % 3 === 0) block(g, w + 0.2, 0.22, d + 0.2, mat(c.type === 'tower' ? '#dfe7ec' : PAL.cream), 0, 0.3 + f * fh, 0, { r: 0.08 });
        if (c.type === 'apartment') for (let f = 1; f < floors; f++) for (const bx of [-w / 4, w / 4]) block(g, 2.6, 0.18, 1.1, mat(PAL.cream), bx, 0.3 + f * fh, d / 2 + 0.55, { r: 0.06 });
        flatRoof(g, w, d, wallH + 0.3);
        block(g, Math.min(4, w / 3), 1.5, Math.min(3, d / 3), mat(PAL.steel, { metalness: 0.3 }), w * 0.2, wallH + 1.1, -d * 0.15, { r: 0.18 });
        if (c.type === 'tower') block(g, w * 0.5, 2.4, d * 0.5, mat('#dfe7ec'), 0, wallH + 1.6, 0, { r: 0.3 });
        height = wallH + (c.type === 'tower' ? 3.2 : 1.6);
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d, wallH + 0.3, floors, Math.max(2, Math.round(w / 3)), Math.max(2, Math.round(d / 3)), 1.3, 1.4, (face, lx, f) => face === 'front' && f === 0 && Math.abs(lx) < 1.6, 0.3);
        block(g, 2.2, 2.6, 0.25, mat('#3b6f7a'), 0, 1.6, d / 2 + 0.06, { r: 0.06, cast: false });
        if (c.label) groups[c.id].signs.push({ mesh: sign(c.label, 3.6, d / 2 + 0.1, '#2c2f33', '#f3e6c8', 4.4), emissive: 0.7 });
        addPool(c.id, c.x, c.z, Math.max(w, d) * 2.2, '#ffb36b', 0.16);
        walkPath(c, g.rotation.y, d);
        break;
      }
      case 'pump': {
        // water pump station: brick pump house + storage tank + pipework (critical service)
        pad();
        const ph = new THREE.Group();
        ph.position.set(-w / 4, 0, 0);
        g.add(ph);
        block(ph, w / 2, 4, d * 0.7, mat(PAL.brick), 0, 2.3, 0, { r: 0.25 });
        height = gable(ph, w / 2, d * 0.7, 4.3, 2, mat(PAL.brick), roof('#8a5a3a'), 0.5);
        block(ph, 1.2, 2.2, 0.22, mat('#3b6f7a'), 0, 1.4, (d * 0.7) / 2 + 0.05, { r: 0.06, cast: false });
        cyl(g, 2.8, 2.8, 6.5, mat('#b9cbd3', { roughness: 0.4, metalness: 0.2 }), w / 4, 3.6, 0, 24);
        const lid = new THREE.Mesh(new THREE.SphereGeometry(2.85, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9fb5c4', { metalness: 0.2 }));
        lid.position.set(w / 4, 6.85, 0);
        g.add(lid);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, w / 2, 10), mat('#3f7fa8', { metalness: 0.3 }));
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(0, 1.2, d * 0.3);
        g.add(pipe);
        ensureGroup(c.id, new THREE.Vector3(c.x, 8, c.z), 8);
        facadeWindows(c.id, ph, w / 2, d * 0.7, 4.3, 1, 2, 1, 1.0, 1.0, (face, lx) => face === 'front' && Math.abs(lx) < 0.8, 0.3);
        const sg = sign('WATER', 5.0, d / 2 + 0.05, '#ffffff', '#3f7fa8', 3.2);
        sg.position.x = w / 4;
        groups[c.id].signs.push({ mesh: sg, emissive: 0.6 });
        addPool(c.id, c.x, c.z, 20, '#cfe2ff', 0.2);
        height = 8;
        break;
      }
      case 'factory':
      case 'warehouse': {
        pad();
        const wallH = c.type === 'factory' ? 6.5 : 7;
        const wm = mat(c.type === 'factory' ? PAL.brick : '#c9c2b4');
        block(g, w, wallH, d, wm, 0, wallH / 2 + 0.3, 0, { r: 0.3 });
        const corr = new THREE.MeshStandardMaterial({ color: '#8d9399', map: ribTexture('#a3a8ad'), roughness: 0.6, metalness: 0.3 });
        if (c.type === 'factory') {
          // saw-tooth roof
          const n = Math.max(2, Math.round(w / 7));
          for (let i = 0; i < n; i++) {
            const t = new THREE.Group();
            t.position.x = -w / 2 + (w / n) * (i + 0.5);
            t.rotation.y = Math.PI / 2;
            g.add(t);
            gable(t, d, w / n, wallH + 0.3, 2.2, wm, corr, 0.2);
          }
          cyl(g, 0.9, 1.1, 18, mat('#e9d6ae'), w / 2 - 2, 9, -d / 2 + 2, 16);
          cyl(g, 1.15, 1.15, 0.5, mat('#6b5a48'), w / 2 - 2, 18.2, -d / 2 + 2, 16);
          sources[c.id] = { stacks: [new THREE.Vector3(c.x + w / 2 - 2, 18.6, c.z - d / 2 + 2)], customer: true };
        } else gable(g, w, d, wallH + 0.3, 2.6, wm, corr, 0.6);
        const roller = new THREE.MeshStandardMaterial({ map: ribTexture('#9ea5aa'), roughness: 0.55, metalness: 0.25 });
        for (let i = 0; i < Math.max(1, Math.round(w / 9)); i++) block(g, 4.2, 4.2, 0.3, roller, -w / 2 + 4 + i * 8.5, 2.4, d / 2 + 0.05, { r: 0.08, cast: false });
        height = wallH + 3;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d, wallH + 0.3, 2, 0, Math.max(2, Math.round(d / 4)), 1.6, 1.2, () => false, 0.3);
        if (c.label) groups[c.id].signs.push({ mesh: sign(c.label, wallH - 0.6, d / 2 + 0.12, '#2c2f33', '#ffc531', 6), emissive: 0.6 });
        addPool(c.id, c.x, c.z, Math.max(w, d) * 1.8, '#ffd9a0', 0.18);
        break;
      }
      case 'mill': {
        // steel mill (GDD Stage 3 large load): melt shop, furnace tower, two tall banded stacks
        pad('#b8b2a6');
        const shed = mat('#b9b3a6');
        block(g, w, 11, d * 0.7, shed, 0, 5.8, -d * 0.15, { r: 0.4 });
        gable(g, w, d * 0.7, 11.3, 3.5, shed, new THREE.MeshStandardMaterial({ color: '#7d848a', map: ribTexture('#8d9399'), roughness: 0.6, metalness: 0.3 }), 0.6);
        block(g, 8, 18, 8, mat('#8b5a43'), w / 2 - 6, 9.3, d / 2 - 6, { r: 0.4 });
        const stacks = [];
        for (const sx of [-w / 2 + 5, -w / 2 + 10]) {
          cyl(g, 1.2, 1.6, 34, mat('#efe8dc'), sx, 17, d / 2 - 4, 16);
          for (const y of [26, 31]) cyl(g, 1.35, 1.35, 1.6, mat('#d4612d'), sx, y, d / 2 - 4, 16);
          stacks.push(new THREE.Vector3(c.x + sx, 34.5, c.z + d / 2 - 4));
        }
        const conv = new THREE.Mesh(rbox(3, 1, 18, 0.2), mat('#6b6f73'));
        conv.position.set(w / 2 - 6, 12, -4);
        conv.rotation.x = 0.35;
        g.add(conv);
        sources[c.id] = { stacks, customer: true, glow: true };
        height = 22;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d * 0.7, 11.3, 2, Math.round(w / 4), 3, 2.0, 1.4, () => false, 0.3);
        groups[c.id].signs.push({ mesh: sign(c.label || 'IRONVALE STEEL', 9.2, d * 0.2 + 0.12, '#2c2f33', '#ffc531', 9), emissive: 0.6 });
        addPool(c.id, c.x, c.z, Math.max(w, d) * 1.6, '#ffb36b', 0.22);
        break;
      }
      case 'datacenter': {
        pad('#b8b2a6');
        const wallH = 7;
        block(g, w, wallH, d, mat('#d7dbde'), 0, wallH / 2 + 0.3, 0, { r: 0.3 });
        flatRoof(g, w, d, wallH + 0.3, '#c9ced2', '#8a8f94');
        for (let i = 0; i < Math.floor(w / 4); i++) for (let k = 0; k < Math.floor(d / 5); k++) {
          block(g, 2.6, 1.4, 3, mat('#9fa6ab', { metalness: 0.3 }), -w / 2 + 2.5 + i * 4, wallH + 1.1, -d / 2 + 3 + k * 5, { r: 0.2 });
          cyl(g, 0.9, 0.9, 0.25, mat('#5d6266'), -w / 2 + 2.5 + i * 4, wallH + 1.9, -d / 2 + 3 + k * 5, 14);
        }
        height = wallH + 2.2;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d, wallH + 0.3, 1, Math.round(w / 6), 2, 0.8, 0.6, () => false, 2.5);
        groups[c.id].signs.push({ mesh: sign(c.label || 'DATA', 5.4, d / 2 + 0.1, '#ffffff', '#3d6fa8', 5), emissive: 0.8 });
        addPool(c.id, c.x, c.z, Math.max(w, d) * 1.8, '#cfe2ff', 0.2);
        break;
      }
      case 'evhub': {
        // EV charging hub (reso/graphic image 11): solar canopy, green charger posts, parked cars
        block(g, w + 0.6, 0.25, d + 0.6, mat('#4a4b4f'), 0, 0.13, 0, { r: 0.1, cast: false });
        for (let i = 0; i < 6; i++) block(g, 0.18, 0.02, d * 0.42, mat(PAL.mark), -w / 2 + 1.5 + i * (w / 6), 0.27, -d / 4, { r: 0.01, cast: false });
        for (const px of [-w / 2 + 1, w / 2 - 1]) for (const pz of [-d / 4 - 2, -d / 4 + 2]) cyl(g, 0.15, 0.15, 4, mat('#e9e4da'), px, 2.2, pz, 8);
        block(g, w, 0.3, 6, mat('#e9e4da'), 0, 4.3, -d / 4, { r: 0.1 });
        const panel = new THREE.MeshStandardMaterial({ color: '#2b4f8a', roughness: 0.25, metalness: 0.4 });
        block(g, w - 0.6, 0.12, 5.4, panel, 0, 4.5, -d / 4, { r: 0.03, cast: false });
        const glowM = new THREE.MeshStandardMaterial({ color: '#3fbf6b', emissive: '#3fff7a', emissiveIntensity: 0 });
        for (let i = 0; i < 5; i++) {
          block(g, 0.6, 1.6, 0.5, mat('#3f8f6b'), -w / 2 + 2 + i * (w / 5.5), 1.1, d / 4 - 1, { r: 0.12 });
          const lamp = block(g, 0.4, 0.2, 0.52, glowM, -w / 2 + 2 + i * (w / 5.5), 1.75, d / 4 - 1, { r: 0.05, cast: false });
          void lamp;
        }
        const carCols = ['#f4f1ea', '#d9443a', '#3d6fa8', '#f2b630'];
        for (let i = 0; i < 4; i++) {
          const car = new THREE.Mesh(rbox(2, 1.2, 4, 0.45), mat(carCols[i], { roughness: 0.4 }));
          car.position.set(-w / 2 + 2 + i * (w / 4.5), 0.85, -d / 4);
          car.castShadow = true;
          g.add(car);
        }
        height = 5;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        groups[c.id].signs.push({ mesh: { material: glowM }, emissive: 1.2 });
        addBulb(c.id, new THREE.Vector3(c.x, 4, c.z), 0.3, 0.1, new THREE.Color(1.6, 2.4, 1.8));
        addPool(c.id, c.x, c.z, Math.max(w, d) * 1.6, '#d9ffe4', 0.2);
        break;
      }
      case 'hospital': {
        pad();
        const wallH = 10;
        const white = mat('#f5f1e8');
        block(g, w, wallH, d, white, 0, wallH / 2 + 0.3, 0, { r: 0.4 });
        block(g, w + 0.3, 0.5, d + 0.3, mat('#3e9a8c'), 0, 4, 0, { r: 0.18 });
        flatRoof(g, w, d, wallH + 0.3);
        const hp = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.25, 28), new THREE.MeshStandardMaterial({ map: plateTexture('H', '#ffffff', '#3e9a8c', 256, 256) }));
        hp.rotation.x = -Math.PI / 2;
        hp.position.set(0, wallH + 0.5, 0);
        g.add(hp);
        height = wallH + 1;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d, wallH + 0.3, 3, Math.round(w / 3), Math.round(d / 3), 1.3, 1.3, (face, lx, f) => face === 'front' && f === 0 && Math.abs(lx) < 2, 0.3);
        const signMat = new THREE.MeshStandardMaterial({ color: '#e2453a', map: crossTexture(), transparent: true, emissive: '#ff3b2f', emissiveMap: crossTexture(), emissiveIntensity: 0 });
        groups[c.id].signs.push({ mesh: plane(g, 3, 3, signMat, w / 3, wallH - 2, d / 2 + 0.1), emissive: 1.6 });
        addPool(c.id, c.x, c.z, Math.max(w, d) * 2, '#ffc58a', 0.2);
        walkPath(c, g.rotation.y, d);
        break;
      }
      case 'port': {
        pad('#b8b2a6');
        const shedM = mat('#c9c2b4');
        block(g, w * 0.6, 7, d * 0.6, shedM, -w * 0.15, 3.8, 0, { r: 0.3 });
        gable(g, w * 0.6, d * 0.6, 7.3, 2.4, shedM, new THREE.MeshStandardMaterial({ color: '#3d6fa8', map: ribTexture('#5b86b8'), roughness: 0.6 }), 0.5);
        const crane = mat('#f2b630', { roughness: 0.5 });
        for (const sz of [-d / 4, d / 4]) block(g, 0.8, 16, 0.8, crane, w * 0.35, 8.3, sz, { r: 0.15 });
        block(g, 1, 1, d * 0.8, crane, w * 0.35, 16.5, 0, { r: 0.2 });
        block(g, 14, 0.8, 0.8, crane, w * 0.35 + 5, 15.5, 0, { r: 0.15 });
        const cont = ['#d9443a', '#3d6fa8', '#3f8f6b', '#e9862c'];
        for (let i = 0; i < 6; i++) block(g, 5.5, 2.4, 2.3, mat(cont[i % 4]), -w * 0.2 + (i % 3) * 6, 1.6 + Math.floor(i / 3) * 2.45, d * 0.38, { r: 0.1 });
        height = 12;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w * 0.6, d * 0.6, 7.3, 1, 3, 2, 1.6, 1.0, () => false, 0.3);
        addBulb(c.id, new THREE.Vector3(c.x + w * 0.35, 17.2, c.z), 0.5, 0.1, new THREE.Color(2.4, 2.0, 1.4));
        addPool(c.id, c.x, c.z, Math.max(w, d) * 1.6, '#ffe2b0', 0.24);
        break;
      }
      case 'resort': {
        // island resort: low white wings with balconies, a pool, palms and a thatched beach bar
        pad('#e6d6b0');
        const wing = mat('#f6f1e6');
        const wallH = 3.2 * 3;
        block(g, w * 0.62, wallH, d * 0.55, wing, -w * 0.16, wallH / 2 + 0.3, -d * 0.18, { r: 0.4 });
        block(g, w * 0.3, wallH - 3.2, d * 0.5, wing, w * 0.32, (wallH - 3.2) / 2 + 0.3, -d * 0.2, { r: 0.4 });
        for (let f = 1; f <= 3; f++) block(g, w * 0.62 + 0.2, 0.2, 1.4, mat('#cfe7e3'), -w * 0.16, 0.3 + f * 3.2 - 1.6, -d * 0.18 + d * 0.275 + 0.6, { r: 0.06 });
        flatRoof(g, w * 0.62, d * 0.55, wallH + 0.3, '#e9e2d4', '#cbbfa8');
        const pool = new THREE.Mesh(rbox(w * 0.36, 0.25, d * 0.26, 0.6), new THREE.MeshStandardMaterial({ color: '#3fb6c9', roughness: 0.1, metalness: 0.1, emissive: '#3fd4e9', emissiveIntensity: 0.12 }));
        pool.position.set(-w * 0.12, 0.45, d * 0.3);
        g.add(pool);
        const bar = new THREE.Group();
        bar.position.set(w * 0.33, 0, d * 0.28);
        g.add(bar);
        cyl(bar, 2.4, 2.4, 2.4, mat('#a0784e'), 0, 1.5, 0, 12);
        const thatch = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.6, 10), mat('#d8b46a', { roughness: 1 }));
        thatch.position.set(0, 4.1, 0);
        thatch.castShadow = true;
        bar.add(thatch);
        for (const ux of [-w * 0.3, -w * 0.18, -w * 0.06, w * 0.06]) {
          const um = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 8), mat(['#d9443a', '#f6efe2', '#3d6fa8', '#f2b630'][Math.abs(Math.round(ux)) % 4]));
          um.position.set(ux, 2.4, d * 0.45);
          g.add(um);
          cyl(g, 0.06, 0.06, 2.2, mat('#e9e4da'), ux, 1.3, d * 0.45, 6);
        }
        height = wallH + 1;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w * 0.62, d * 0.55, wallH + 0.3, 3, Math.max(3, Math.round(w / 5)), 2, 1.2, 1.3, () => false, 0.3);
        if (c.label) groups[c.id].signs.push({ mesh: sign(c.label, 2.4, d * 0.1 + 0.3, '#ffffff', '#2f8f8a', 5), emissive: 0.8 });
        addBulb(c.id, new THREE.Vector3(c.x, 3.4, c.z), 0.4, 0.1, new THREE.Color(2.4, 1.8, 1.0));
        addPool(c.id, c.x, c.z, Math.max(w, d) * 1.8, '#ffd9a0', 0.2);
        break;
      }
      case 'desal': {
        // desalination plant: membrane hall, two big clear-water tanks and an intake pipe to the sea
        pad();
        block(g, w * 0.55, 6, d * 0.7, mat('#e3e8ea'), -w * 0.2, 3.3, 0, { r: 0.3 });
        gable(g, w * 0.55, d * 0.7, 6.3, 1.6, mat('#e3e8ea'), new THREE.MeshStandardMaterial({ color: '#3d7fa8', map: ribTexture('#5b9ac2'), roughness: 0.6 }), 0.4);
        for (const tz of [-d * 0.22, d * 0.22]) {
          cyl(g, 3.4, 3.4, 5.5, mat('#b9cbd3', { roughness: 0.4, metalness: 0.2 }), w * 0.3, 3.05, tz, 24);
          const lid = new THREE.Mesh(new THREE.SphereGeometry(3.45, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9fb5c4', { metalness: 0.2 }));
          lid.position.set(w * 0.3, 5.8, tz);
          g.add(lid);
        }
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 24, 10), mat('#3f7fa8', { metalness: 0.3 }));
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(-w * 0.2, 0.7, d / 2 + 11);
        g.add(pipe);
        height = 8;
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w * 0.55, d * 0.7, 6.3, 1, 3, 2, 1.4, 1.0, () => false, 0.3);
        groups[c.id].signs.push({ mesh: sign(c.label || 'WATER', 5.2, d * 0.35 + 0.1, '#ffffff', '#3f7fa8', 4), emissive: 0.6 });
        addPool(c.id, c.x, c.z, 26, '#cfe2ff', 0.2);
        break;
      }
      default: {
        // generic block
        pad();
        block(g, w, 5, d, mat(PAL.walls[0]), 0, 2.8, 0, { r: 0.3 });
        height = gable(g, w, d, 5.3, 2.4, mat(PAL.walls[0]), roof(PAL.roofs[0]), 0.6);
        ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
        facadeWindows(c.id, g, w, d, 5.3, 1, 2, 2, 1.2, 1.1, () => false, 0.3);
      }
    }
    return height;
  }

  const sources = {};
  const buildings = {};
  for (const c of map.customers) {
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    root.add(g);
    let height = 6;
    if (c.type === 'home') {
      const yaw = facing(c, true);
      g.rotation.y = yaw;
      const two = R() < 0.55;
      const wallH = two ? 5.4 : 3.8;
      const wallMat = mat(PAL.walls[Math.floor(R() * PAL.walls.length)]);
      const roofMat = roof(PAL.roofs[Math.floor(R() * PAL.roofs.length)]);
      const w = c.w - 0.6;
      const d = c.d - 1.2;
      block(g, w + 0.5, 0.5, d + 0.5, mat(PAL.concrete), 0, 0.25, 0, { r: 0.12, cast: false }); // plinth
      block(g, w, wallH, d, wallMat, 0, wallH / 2 + 0.3, 0, { r: 0.3 });
      height = gable(g, w, d, wallH + 0.3, 2.8, wallMat, roofMat, 0.75);
      g.userData.roof = { w, d, eave: wallH + 0.3, rise: 2.8, oh: 0.75, t: 0.45 };
      block(g, 0.9, 2.4, 0.9, mat(PAL.brick), w * 0.26, wallH + 2.6, -d * 0.18, { r: 0.1 }); // chimney
      block(g, 1.3, 2.3, 0.25, mat(PAL.woodDark), 0, 1.45, d / 2 + 0.06, { r: 0.08, cast: false }); // door
      block(g, 2.0, 0.24, 0.9, mat(PAL.concrete), 0, 0.42, d / 2 + 0.5, { r: 0.06, cast: false }); // step
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      facadeWindows(c.id, g, w, d, wallH + 0.3, two ? 2 : 1, 2, 2, 1.2, 1.15, (face, lx, f) => face === 'front' && f === 0 && Math.abs(lx) < 1.2, 0.3);
      addPool(c.id, c.x, c.z, 20, '#ffb36b', 0.14);
      walkPath(c, yaw, d);
      for (const [bx, bz] of [[-w / 2 - 0.9, d / 2 + 0.6], [w / 2 + 0.9, d / 2 + 0.4], [w / 2 + 0.8, -d / 2 + 0.2]]) {
        const p = new THREE.Vector3(bx, 0, bz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        bushSpots.push([c.x + p.x, c.z + p.z, 0.9 + R() * 0.5]);
      }
    } else if (c.type === 'school') {
      g.rotation.y = facing(c, false);
      const w = c.w - 1;
      const d = c.d - 1;
      const wallH = 7.6;
      const brick = mat(PAL.brick);
      const trim = mat(PAL.cream);
      const roofMat = roof('#c4542c');
      block(g, w + 0.8, 0.5, d + 0.8, mat(PAL.concrete), 0, 0.25, 0, { r: 0.12, cast: false });
      block(g, w, wallH, d, brick, 0, wallH / 2 + 0.3, 0, { r: 0.3 });
      block(g, w + 0.25, 0.35, d + 0.25, trim, 0, wallH / 2 + 0.3, 0, { r: 0.12 }); // floor band
      block(g, w + 0.3, 0.4, d + 0.3, trim, 0, wallH + 0.25, 0, { r: 0.15 }); // cornice
      height = gable(g, w, d, wallH + 0.45, 3.2, brick, roofMat, 0.8);
      // central portico with its own gable facing the road + clock
      const pg = new THREE.Group();
      pg.position.set(0, 0, d / 2 + 1.0);
      g.add(pg);
      block(pg, 7.2, 9.2, 2.6, brick, 0, 4.9, 0, { r: 0.25 });
      block(pg, 7.5, 0.4, 2.9, trim, 0, 9.5, 0, { r: 0.14 });
      const pr = new THREE.Group();
      pr.rotation.y = Math.PI / 2;
      pr.position.y = 0;
      pg.add(pr);
      gable(pr, 2.6, 7.2, 9.6, 2.4, brick, roofMat, 0.5);
      const clock = plane(pg, 2.2, 2.2, new THREE.MeshStandardMaterial({ map: clockTexture(), transparent: true }), 0, 10.7, 1.33);
      void clock;
      const sign = plane(pg, 5.6, 1.4, new THREE.MeshStandardMaterial({ map: plateTexture('SCHOOL', '#6a2a14', '#f3e6c8'), emissive: '#ffffff', emissiveMap: plateTexture('SCHOOL', '#6a2a14', '#f3e6c8'), emissiveIntensity: 0 }), 0, 6.9, 1.33);
      block(pg, 2.8, 3.4, 0.3, mat(PAL.woodDark), 0, 2.0, 1.25, { r: 0.08, cast: false });
      for (let i = 0; i < 3; i++) block(pg, 4.6 - i * 0.6, 0.3, 1.2 - i * 0.3, mat(PAL.concrete), 0, 0.15 + i * 0.3, 1.9 - i * 0.2, { r: 0.06, cast: false });
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      groups[c.id].signs.push({ mesh: sign, emissive: 0.9 });
      facadeWindows(c.id, g, w, d, wallH + 0.3, 2, 8, 3, 1.4, 1.5, (face, lx) => face === 'front' && Math.abs(lx) < 4.2, 0.3);
      addPool(c.id, c.x, c.z + 4, 36, '#ffb36b', 0.18);
      walkPath(c, g.rotation.y, d + 4);
      // flag pole with a yellow flag, benches, bushes
      const fp = new THREE.Vector3(w / 2 + 2.5, 0, d / 2 + 4).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
      cyl(root, 0.12, 0.14, 11, mat('#e9e4da', { metalness: 0.4 }), c.x + fp.x, 5.5, c.z + fp.z, 8);
      const flag = plane(root, 2.4, 1.5, new THREE.MeshStandardMaterial({ color: '#ffc531', side: THREE.DoubleSide }), c.x + fp.x + 1.25, 10.1, c.z + fp.z);
      void flag;
      for (let i = 0; i < 6; i++) {
        const lx = -w / 2 + 1.5 + (i * (w - 3)) / 5;
        if (Math.abs(lx) > 5) bushSpots.push([c.x + lx, c.z + (d / 2 + 1.0) * (g.rotation.y === 0 ? 1 : -1), 1.0]);
      }
    } else if (c.type === 'clinic') {
      g.rotation.y = facing(c, false);
      const w = c.w - 1;
      const d = c.d - 1;
      const wallH = 7.2;
      const white = mat('#f5f1e8');
      const teal = mat('#3e9a8c');
      block(g, w + 0.8, 0.5, d + 0.8, mat(PAL.concrete), 0, 0.25, 0, { r: 0.12, cast: false });
      block(g, w, wallH, d, white, 0, wallH / 2 + 0.3, 0, { r: 0.35 });
      block(g, w + 0.3, 0.5, d + 0.3, teal, 0, 3.7, 0, { r: 0.18 }); // accent band
      const para = mat('#e9e2d4');
      block(g, w + 0.4, 0.9, 0.5, para, 0, wallH + 0.7, d / 2 - 0.05, { r: 0.15 }); // parapet ring
      block(g, w + 0.4, 0.9, 0.5, para, 0, wallH + 0.7, -d / 2 + 0.05, { r: 0.15 });
      block(g, 0.5, 0.9, d, para, w / 2 - 0.05, wallH + 0.7, 0, { r: 0.15 });
      block(g, 0.5, 0.9, d, para, -w / 2 + 0.05, wallH + 0.7, 0, { r: 0.15 });
      block(g, w - 0.4, 0.16, d - 0.4, mat('#8f8a80', { roughness: 1 }), 0, wallH + 0.36, 0, { r: 0.04, cast: false }); // roof deck
      block(g, 2.2, 0.5, 2.2, mat('#bfe2ea', { roughness: 0.2, metalness: 0.2 }), -w * 0.18, wallH + 0.6, d * 0.1, { r: 0.12 }); // skylight
      block(g, 1.6, 1.0, 1.6, mat(PAL.steel, { metalness: 0.3 }), w * 0.05, wallH + 0.9, -d * 0.22, { r: 0.15 });
      block(g, 3.2, 1.6, 2.6, mat(PAL.steel, { metalness: 0.3 }), w * 0.22, wallH + 1.2, -d * 0.15, { r: 0.2 });
      block(g, 6, 0.4, 3.4, teal, -w * 0.22, 3.4, d / 2 + 1.6, { r: 0.15 }); // canopy
      for (const sx of [-1, 1]) cyl(g, 0.14, 0.14, 3.2, white, -w * 0.22 + sx * 2.6, 1.7, d / 2 + 3.0, 8);
      block(g, 2.4, 2.8, 0.25, mat('#3b6f7a'), -w * 0.22, 1.7, d / 2 + 0.06, { r: 0.06, cast: false });
      const height0 = wallH + 1.0;
      height = height0;
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      for (const side of [1, -1]) {
        const signMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: crossTexture(), transparent: true, emissive: '#ff3b2f', emissiveMap: crossTexture(), emissiveIntensity: 0 });
        signMat.color.set('#e2453a');
        block(g, 3.0, 3.0, 0.3, mat('#f5f1e8'), w * 0.25, wallH - 1.6, side * (d / 2 + 0.18), { r: 0.2 });
        const cr = plane(g, 2.4, 2.4, signMat, w * 0.25, wallH - 1.6, side * (d / 2 + 0.35), side > 0 ? 0 : Math.PI);
        groups[c.id].signs.push({ mesh: cr, emissive: 1.6 });
      }
      facadeWindows(c.id, g, w, d, wallH + 0.3, 2, 5, 3, 1.4, 1.3, (face, lx, f) => (face === 'front' && f === 0 && Math.abs(lx + w * 0.22) < 1.8) || (face !== 'side' && f === 1 && Math.abs(lx - w * 0.25) < 1.8), 0.3);
      addPool(c.id, c.x, c.z - 3, 28, '#ffc58a', 0.2);
      walkPath(c, g.rotation.y, d);
    } else if (c.type === 'market') {
      // open-air market (reso/graphic image 24): striped stall canopies you can see from above,
      // a small corner shop with an awning, crates and produce.
      g.rotation.y = facing(c, false);
      const w = c.w - 1;
      const d = c.d - 1;
      block(g, w + 1, 0.3, d + 1, mat('#d8c39b'), 0, 0.15, 0, { r: 0.12, cast: false }); // paved square
      const shop = new THREE.Group();
      shop.position.set(-w / 2 + 3.2, 0, -d / 2 + 2.6);
      g.add(shop);
      const sw = mat('#f2d9b0');
      block(shop, 6, 4.4, 5, sw, 0, 2.5, 0, { r: 0.3 });
      height = gable(shop, 6, 5, 4.7, 2.2, sw, roof('#d4612d'), 0.5);
      block(shop, 1.2, 2.2, 0.22, mat(PAL.woodDark), 1.4, 1.4, 2.56, { r: 0.06, cast: false });
      const shopAwn = new THREE.Mesh(rbox(5.4, 0.14, 1.6, 0.05), new THREE.MeshStandardMaterial({ map: stripeTexture('#d9443a', '#f6efe2'), roughness: 0.8 }));
      shopAwn.position.set(0, 3.2, 3.1);
      shopAwn.rotation.x = 0.35;
      shopAwn.castShadow = true;
      shop.add(shopAwn);
      const awn = [['#d9443a', '#f6efe2'], ['#e9862c', '#f6efe2'], ['#3f8f6b', '#f6efe2'], ['#3d6fa8', '#f6efe2']];
      const produce = ['#e8432f', '#f3b22e', '#6bb23a', '#9c4bb0', '#f07d2a'];
      const spots = [[1.5, -2.0], [6.0, -2.0], [-4.5, 2.6], [1.5, 2.6], [6.0, 2.6]];
      spots.forEach(([sx, sz], i) => {
        const st = new THREE.Group();
        st.position.set(sx, 0, sz);
        g.add(st);
        for (const px of [-1.7, 1.7]) for (const pz of [-1.3, 1.3]) cyl(st, 0.1, 0.1, 2.9, mat(PAL.wood), px, 1.75, pz, 6);
        const stripes = new THREE.MeshStandardMaterial({ map: stripeTexture(...awn[i % awn.length]), roughness: 0.8 });
        for (const s2 of [1, -1]) {
          const a = new THREE.Mesh(rbox(4.0, 0.12, 1.75, 0.04), stripes);
          a.position.set(0, 3.45, s2 * 0.82);
          a.rotation.x = s2 * 0.38;
          a.castShadow = true;
          st.add(a);
        }
        block(st, 3.0, 1.0, 1.4, mat('#a8774a'), 0, 0.8, 0, { r: 0.1 });
        for (let k = 0; k < 3; k++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat(produce[(i + k) % produce.length]));
          b.scale.y = 0.6;
          b.position.set(-0.95 + k * 0.95, 1.45, 0);
          st.add(b);
        }
      });
      for (let i = 0; i < 5; i++) block(g, 0.9, 0.7, 0.9, mat('#b9894f'), -w / 2 + 1 + R() * 3, 0.65, d / 2 - 1 - R() * 2, { r: 0.06 });
      ensureGroup(c.id, new THREE.Vector3(c.x, Math.max(height, 4.5), c.z), Math.max(height, 4.5));
      g.updateMatrixWorld(true);
      // festoon lights strung across the square
      for (const s2 of [1, -1]) {
        for (let i = 0; i <= 14; i++) {
          const f = i / 14;
          const sag = Math.sin(f * Math.PI) * 0.9;
          const p = new THREE.Vector3(-w / 2 + 6 + f * (w - 6.5), 4.3 - sag, s2 * 0.3 + (s2 > 0 ? 2.6 : -2.0)).applyMatrix4(g.matrixWorld);
          addBulb(c.id, p, 0.24, 0.05 + f * 0.8, i % 3 === 0 ? new THREE.Color(2.4, 1.0, 0.5) : WARM);
        }
      }
      shop.updateMatrixWorld(true);
      facadeWindows(c.id, shop, 6, 5, 4.7, 1, 2, 2, 1.1, 1.0, (face, lx) => face === 'front' && lx > 0.4);
      addPool(c.id, c.x, c.z, 30, '#ffb36b', 0.22);
    } else {
      height = buildExtra(c, g);
    }
    const pv = c.pvKWp ? rooftopPV(c, g, height) : null;
    let plot = null;
    if (c.appearAt != null) {
      // growth plot: cleared lot with a "new home" stake until the family moves in
      g.visible = false;
      plot = new THREE.Group();
      plot.position.set(c.x, 0, c.z);
      root.add(plot);
      block(plot, c.w - 0.5, 0.18, c.d - 0.5, mat('#9b7a52', { roughness: 1 }), 0, 0.09, 0, { r: 0.2, cast: false });
      for (const [px, pz] of [[-c.w / 2 + 0.4, -c.d / 2 + 0.4], [c.w / 2 - 0.4, -c.d / 2 + 0.4], [-c.w / 2 + 0.4, c.d / 2 - 0.4], [c.w / 2 - 0.4, c.d / 2 - 0.4]]) cyl(plot, 0.08, 0.08, 1.0, mat('#e8dcc2'), px, 0.5, pz, 6);
      cyl(plot, 0.1, 0.1, 2.4, mat(PAL.wood), 0, 1.2, c.d / 2 - 0.6, 6);
      plane(plot, 2.4, 1.2, new THREE.MeshStandardMaterial({ map: plateTexture('NEW HOME', '#5a2e1a', '#ffd25a', 384, 160), side: THREE.DoubleSide }), 0, 2.2, c.d / 2 - 0.55);
    }
    buildings[c.id] = { group: g, height, c, plot, pv };
  }

  // ---------------------------------------------------------------- generation sources
  /** Diesel power house (reso/graphic image 102): brick hall, two cream chimneys, engine annex. */
  function powerhouse(gen, gid = 'genyard') {
    const genG = new THREE.Group();
    root.add(genG);
    block(genG, gen.w + 8, 0.35, gen.d + 8, mat(PAL.concrete), gen.x, 0.18, gen.z, { r: 0.15, cast: false });
    const ph = new THREE.Group();
    ph.position.set(gen.x - 2.4, 0, gen.z - 0.8);
    genG.add(ph);
    const brick = mat(PAL.brick);
    block(ph, 9.5, 6.6, 7.6, brick, 0, 3.6, 0, { r: 0.3 });
    block(ph, 9.9, 0.4, 8.0, mat(PAL.cream), 0, 0.6, 0, { r: 0.12 });
    gable(ph, 9.5, 7.6, 6.9, 2.6, brick, new THREE.MeshStandardMaterial({ color: '#8d9399', map: ribTexture('#a3a8ad'), roughness: 0.6, metalness: 0.3 }), 0.6);
    block(ph, 2.4, 3.4, 0.3, mat('#4f5357', { metalness: 0.3 }), 0, 2.0, 3.85, { r: 0.08, cast: false });
    const chimMat = mat('#e9d6ae');
    const chimTop = [];
    for (const [cx, cz] of [[-2.6, -1.4], [0.2, -1.4]]) {
      cyl(ph, 0.8, 0.95, 8.2, chimMat, cx, 9.6, cz, 16);
      cyl(ph, 0.95, 0.95, 0.5, mat('#6b5a48'), cx, 13.75, cz, 16);
      chimTop.push(new THREE.Vector3(ph.position.x + cx, 14.2, ph.position.z + cz));
    }
    ensureGroup(gid, new THREE.Vector3(gen.x, 8, gen.z), 8);
    facadeWindows(gid, ph, 9.5, 7.6, 6.9, 1, 3, 2, 1.2, 1.8, (face, lx) => face === 'front' && Math.abs(lx) < 1.8, 0.6);
    // engine annex with radiator fan + status beacon
    const ax = gen.x + 5.2;
    const az = gen.z - 0.8;
    block(genG, 4.6, 3.8, 6.4, mat('#d7cdb7'), ax, 2.2, az, { r: 0.3 });
    block(genG, 4.9, 0.3, 6.7, mat('#8d9399'), ax, 4.2, az, { r: 0.1 });
    const fan = new THREE.Group();
    fan.position.set(ax, 4.5, az - 1.2);
    genG.add(fan);
    cyl(fan, 1.25, 1.25, 0.3, mat('#5d6266', { metalness: 0.4 }), 0, 0, 0, 18);
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(rbox(2.0, 0.08, 0.45, 0.03), mat('#c9ccce', { metalness: 0.4 }));
      bl.position.y = 0.2;
      bl.rotation.y = (i * Math.PI) / 4;
      fan.add(bl);
    }
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.2) });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), beaconMat);
    beacon.position.set(ax + 1.2, 4.75, az + 2.2);
    genG.add(beacon);
    // diesel tank (cream capsule on saddles)
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 5.2, 6, 16), mat('#efe3c6', { roughness: 0.5 }));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(gen.x - 2.5, 1.75, gen.z + 5.6);
    tank.castShadow = true;
    genG.add(tank);
    for (const sx of [-2, 2]) block(genG, 0.5, 0.9, 2.2, mat('#6b6f73'), gen.x - 2.5 + sx, 0.65, gen.z + 5.6, { r: 0.08 });
    plane(genG, 1.3, 1.3, new THREE.MeshStandardMaterial({ map: hazardTexture(), transparent: true }), gen.x - 2.5, 1.9, gen.z + 6.9);
    // switchgear at the 11 kV port
    block(genG, 2.2, 2.6, 1.6, mat(PAL.steel, { metalness: 0.35, roughness: 0.5 }), gen.port.x - 2.2, 1.5, gen.port.z - 1.8, { r: 0.15 });
    plane(genG, 0.9, 0.9, new THREE.MeshStandardMaterial({ map: hazardTexture(), transparent: true }), gen.port.x - 2.2, 1.7, gen.port.z - 0.98);
    // picket fence + yard lamp
    const fenceMat = mat('#e8dcc2');
    const fx0 = gen.x - gen.w / 2 - 4;
    const fx1 = gen.x + gen.w / 2 + 4;
    const fz0 = gen.z - gen.d / 2 - 4;
    for (let x = fx0; x <= fx1; x += 2) block(genG, 0.22, 1.5, 0.22, fenceMat, x, 0.75, fz0, { r: 0.05, cast: false });
    for (let z = fz0; z <= gen.z + gen.d / 2 + 2; z += 2) {
      block(genG, 0.22, 1.5, 0.22, fenceMat, fx0, 0.75, z, { r: 0.05, cast: false });
    }
    block(genG, fx1 - fx0, 0.18, 0.12, fenceMat, (fx0 + fx1) / 2, 1.1, fz0, { r: 0.04, cast: false });
    block(genG, 0.12, 0.18, gen.z + gen.d / 2 + 2 - fz0, fenceMat, fx0, 1.1, (fz0 + gen.z + gen.d / 2 + 2) / 2, { r: 0.04, cast: false });
    cyl(genG, 0.14, 0.16, 6.4, mat('#3f4a3c'), gen.x - 9, 3.2, gen.z + 6, 8);
    addBulb(gid, new THREE.Vector3(gen.x - 9, 6.5, gen.z + 6), 0.45, 0.1, new THREE.Color(2.4, 2.0, 1.4));
    addPool(gid, gen.x - 7, gen.z + 5, 18, '#ffe2b0', 0.3);

    return { group: genG, beacon, beaconMat, fan, stacks: chimTop, stackTop: chimTop[0], stackTop2: chimTop[1], gid };
  }

  const latMat = mat('#6b7278', { metalness: 0.35, roughness: 0.55 });
  /** Small lattice gantry / tower (reso/graphic image 84/86). */
  function lattice(parent, x, z, h, y0 = 0) {
    const tw = new THREE.Group();
    tw.position.set(x, y0, z);
    parent.add(tw);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 6), latMat);
      leg.position.set(sx * 0.9, h / 2, sz * 0.9);
      leg.rotation.set(sz * 0.05, 0, -sx * 0.05);
      tw.add(leg);
    }
    for (const y of [h * 0.35, h * 0.65]) block(tw, 2.6, 0.18, 2.6, latMat, 0, y, 0, { r: 0.04 });
    block(tw, 9, 0.35, 0.35, latMat, 0, h - 1.2, 0, { r: 0.08 });
    return tw;
  }
  const coolingLathe = (() => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const y = (i / 14) * 46;
      const r = 15 - Math.sin((i / 14) * Math.PI) * 5.5 - (i / 14) * 2;
      pts.push(new THREE.Vector2(r, y));
    }
    return new THREE.LatheGeometry(pts, 40);
  })();
  const turbines = [];
  function turbine(parent, x, z, y0, scale = 1, gid = null) {
    const towerMat = mat('#f1ece2', { roughness: 0.55 });
    const t = new THREE.Group();
    cyl(t, 0.9, 1.7, 46, towerMat, 0, 23, 0, 16);
    block(t, 2.4, 2.4, 5.4, towerMat, 0, 46.5, 0.6, { r: 0.9 });
    const hub = new THREE.Group();
    hub.position.set(0, 46.5, 3.6);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), towerMat);
    nose.scale.z = 1.4;
    hub.add(nose);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(rbox(1.5, 21, 0.5, 0.24), towerMat);
      blade.position.y = 11;
      const arm = new THREE.Group();
      arm.rotation.z = (b * Math.PI * 2) / 3;
      arm.add(blade);
      hub.add(arm);
    }
    t.add(hub);
    t.position.set(x, y0, z);
    t.scale.setScalar(scale);
    t.rotation.y = -Math.PI / 2 + 0.3;
    parent.add(t);
    const lg = gid || 'turb' + turbines.length;
    ensureGroup(lg, new THREE.Vector3(x, y0 + 48 * scale, z), 48 * scale);
    addBulb(lg, new THREE.Vector3(x, y0 + 48.2 * scale, z), 0.6, 0.1, new THREE.Color(3, 0.2, 0.15));
    const tb = { hub, gid: lg, phase: turbines.length * 0.37, speed: 0.9, src: null };
    turbines.push(tb);
    return tb;
  }

  /** Build the visuals for a generation source definition. Returns meta for animation/fx. */
  function buildSource(def) {
    const g = new THREE.Group();
    root.add(g);
    const meta = { id: def.id, type: def.type, group: g, stacks: [], coolingTowers: [], turbines: [], gid: 'src-' + def.id };
    const { x, z } = def;
    const w = def.w || 16;
    const d = def.d || 12;
    switch (def.type) {
      case 'diesel': {
        const ph = powerhouse({ ...def, w, d, port: def.port || { x: x + w / 2 + 2, z: z + d / 2 + 2 } }, meta.gid);
        g.add(ph.group);
        Object.assign(meta, { beaconMat: ph.beaconMat, fan: ph.fan, stacks: ph.stacks });
        break;
      }
      case 'gas': {
        block(g, w + 4, 0.35, d + 4, mat(PAL.concrete), x, 0.18, z, { r: 0.15, cast: false });
        for (let i = 0; i < 2; i++) {
          block(g, w * 0.8, 3.2, 3, mat('#e9e4da'), x, 2, z - d / 4 + i * (d / 2), { r: 0.25 });
          block(g, w * 0.8 + 0.1, 0.3, 3.1, mat('#3f8f6b'), x, 3.2, z - d / 4 + i * (d / 2), { r: 0.08 });
          cyl(g, 0.45, 0.5, 5, mat('#c9ccce', { metalness: 0.4 }), x + w * 0.3, 5.5, z - d / 4 + i * (d / 2), 12);
          meta.stacks.push(new THREE.Vector3(x + w * 0.3, 8.2, z - d / 4 + i * (d / 2)));
        }
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, w + 4, 10), mat('#ffc531'));
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(x, 0.8, z + d / 2 + 1);
        g.add(pipe);
        plane(g, 1.2, 1.2, new THREE.MeshStandardMaterial({ map: hazardTexture(), transparent: true }), x - w * 0.3, 2.2, z + d / 4 + 1.56);
        ensureGroup(meta.gid, new THREE.Vector3(x, 6, z), 6);
        addBulb(meta.gid, new THREE.Vector3(x - w / 2, 5, z), 0.4, 0.1, new THREE.Color(2.4, 2.0, 1.4));
        break;
      }
      case 'coal': {
        // coal station (reso/graphic image 8/16/79): boiler hall, banded stacks, cooling towers, coal pile
        block(g, w + 10, 0.4, d + 10, mat('#b8b2a6'), x, 0.2, z, { r: 0.2, cast: false });
        const hall = mat('#b9b3a6');
        block(g, w * 0.5, 16, d * 0.45, hall, x - w * 0.15, 8.2, z - d * 0.2, { r: 0.4 });
        const hg = new THREE.Group();
        hg.position.set(x - w * 0.15, 0, z - d * 0.2);
        g.add(hg);
        gable(hg, w * 0.5, d * 0.45, 16.3, 3, hall, new THREE.MeshStandardMaterial({ color: '#7d848a', map: ribTexture('#8d9399'), roughness: 0.6 }), 0.5);
        for (const sx of [-w * 0.35, -w * 0.25]) {
          cyl(g, 1.6, 2.2, 46, mat('#efe8dc'), x + sx, 23, z + d * 0.1, 16);
          for (const y of [36, 42]) cyl(g, 1.8, 1.8, 2.2, mat('#d4612d'), x + sx, y, z + d * 0.1, 16);
          meta.stacks.push(new THREE.Vector3(x + sx, 46.5, z + d * 0.1));
        }
        for (const [cx, cz] of [[x + w * 0.3, z - d * 0.2], [x + w * 0.3, z + d * 0.25]]) {
          const m = new THREE.Mesh(coolingLathe, mat('#d9d3c7', { side: THREE.DoubleSide, roughness: 0.9 }));
          m.scale.setScalar(0.62);
          m.position.set(cx, 0, cz);
          m.castShadow = true;
          g.add(m);
          meta.coolingTowers.push({ x: cx, z: cz, top: 46 * 0.62, r: 6 });
        }
        for (let i = 0; i < 5; i++) {
          const pile = new THREE.Mesh(new THREE.SphereGeometry(4 + (i % 2), 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2e2b29', { roughness: 1 }));
          pile.scale.y = 0.5;
          pile.position.set(x - w * 0.4 + i * 3.5, 0.3, z + d * 0.35);
          g.add(pile);
        }
        ensureGroup(meta.gid, new THREE.Vector3(x, 18, z), 18);
        const hgw = new THREE.Group();
        hgw.position.set(x - w * 0.15, 0, z - d * 0.2);
        g.add(hgw);
        facadeWindows(meta.gid, hgw, w * 0.5, d * 0.45, 16, 3, 6, 3, 1.5, 1.3, () => false, 0.3);
        break;
      }
      case 'hydro': {
        // dam across the river (reso/graphic image 75/78)
        const conc = mat('#d7d2c7');
        block(g, w, 9, 4, conc, x, 4.5, z, { r: 0.4 });
        for (let i = 0; i < 3; i++) {
          const sp = new THREE.Mesh(rbox(3, 7.5, 3.2, 0.6), new THREE.MeshStandardMaterial({ color: '#4fa8d8', roughness: 0.1, emissive: '#1d5f88', emissiveIntensity: 0.2 }));
          sp.position.set(x - w / 4 + i * (w / 4), 4, z + 2.2);
          sp.rotation.x = -0.35;
          g.add(sp);
        }
        const phm = mat('#efe3c6');
        block(g, 8, 8, 7, phm, x + w / 2 + 4, 4, z + 2, { r: 0.6 });
        const bolt = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshStandardMaterial({ map: hazardTexture(), transparent: true }));
        bolt.position.set(x + w / 2 + 4, 5, z + 5.55);
        g.add(bolt);
        lattice(g, x + w / 2 + 4, z - 3, 12);
        ensureGroup(meta.gid, new THREE.Vector3(x, 9, z), 9);
        addBulb(meta.gid, new THREE.Vector3(x + w / 2 + 4, 8.6, z + 2), 0.4, 0.1, new THREE.Color(2.4, 2.0, 1.4));
        break;
      }
      case 'runriver': {
        // run-of-river weir across the stream with a small turbine house
        const conc = mat('#d7d2c7');
        block(g, w, 3, 3, conc, x, 1.5, z, { r: 0.3 });
        const fall = new THREE.Mesh(rbox(w * 0.7, 2.6, 1.4, 0.4), new THREE.MeshStandardMaterial({ color: '#7fc3e8', roughness: 0.1, emissive: '#2d7fb0', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }));
        fall.position.set(x, 1.4, z + 2);
        g.add(fall);
        block(g, 9, 6, 7, mat('#efe3c6'), x - w / 2 - 3, 3, z - 8, { r: 0.5 });
        const rg = new THREE.Group();
        rg.position.set(x - w / 2 - 3, 0, z - 8);
        g.add(rg);
        gable(rg, 9, 7, 6, 2, mat('#efe3c6'), roof('#3d6fa8'), 0.4);
        ensureGroup(meta.gid, new THREE.Vector3(x, 7, z), 7);
        addBulb(meta.gid, new THREE.Vector3(x - w / 2 - 3, 5, z - 4.4), 0.4, 0.1, new THREE.Color(2.4, 2.0, 1.4));
        break;
      }
      case 'pumped': {
        // pumped storage: a high lake behind a dam, a penstock down the slope, the powerhouse below
        const lake = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.6, 1, 32), new THREE.MeshStandardMaterial({ color: '#3a87b5', roughness: 0.15, metalness: 0.1 }));
        lake.position.set(x - w * 0.15, 8.6, z - d * 1.4);
        lake.scale.z = 0.7;
        g.add(lake);
        const bank = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.85, 8.2, 32), mat('#7a8a5a', { roughness: 1 }));
        bank.position.set(x - w * 0.15, 4.1, z - d * 1.4);
        bank.scale.z = 0.7;
        bank.castShadow = true;
        g.add(bank);
        block(g, w * 0.9, 9.2, 2.5, mat('#d7d2c7'), x - w * 0.15, 4.6, z - d * 0.95, { r: 0.4 });
        const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, d * 1.1, 12), mat('#8d9399', { metalness: 0.4 }));
        pen.rotation.x = Math.PI / 2 - 0.35;
        pen.position.set(x, 4.2, z - d * 0.45);
        g.add(pen);
        block(g, w * 0.6, 7, d * 0.45, mat('#efe3c6'), x, 3.6, z + d * 0.15, { r: 0.5 });
        const pg = new THREE.Group();
        pg.position.set(x, 0, z + d * 0.15);
        g.add(pg);
        gable(pg, w * 0.6, d * 0.45, 7.2, 2.2, mat('#efe3c6'), roof('#3d6fa8'), 0.5);
        const low = new THREE.Mesh(rbox(w * 0.9, 0.4, d * 0.35, 1), new THREE.MeshStandardMaterial({ color: '#3a87b5', roughness: 0.15 }));
        low.position.set(x, 0.3, z + d * 0.55);
        g.add(low);
        meta.lake = lake;
        lattice(g, x + w * 0.4, z + d * 0.1, 14);
        ensureGroup(meta.gid, new THREE.Vector3(x, 9, z), 9);
        addBulb(meta.gid, new THREE.Vector3(x, 6, z + d * 0.4), 0.4, 0.1, new THREE.Color(2.4, 2.0, 1.4));
        break;
      }
      case 'h2': {
        // green hydrogen: electrolyser hall, white spherical tanks and a hydrogen turbine stack
        block(g, w + 4, 0.35, d + 4, mat(PAL.concrete), x, 0.18, z, { r: 0.15, cast: false });
        block(g, w * 0.5, 6, d * 0.5, mat('#e8eef2'), x - w * 0.22, 3.3, z - d * 0.2, { r: 0.4 });
        block(g, w * 0.5 + 0.1, 0.4, d * 0.5 + 0.1, mat('#3fa7d6'), x - w * 0.22, 5.4, z - d * 0.2, { r: 0.1 });
        for (const [tx, tz] of [[w * 0.2, -d * 0.25], [w * 0.38, -d * 0.25], [w * 0.29, d * 0.15]]) {
          const sph = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), mat('#f4f6f7', { roughness: 0.35, metalness: 0.2 }));
          sph.position.set(x + tx, 4.4, z + tz);
          sph.castShadow = true;
          g.add(sph);
          for (const lx of [-1.6, 1.6]) cyl(g, 0.2, 0.2, 2.4, mat('#9aa0a6'), x + tx + lx, 1.4, z + tz, 6);
        }
        block(g, w * 0.3, 4, d * 0.3, mat('#d7dbde'), x - w * 0.22, 2.2, z + d * 0.3, { r: 0.3 });
        cyl(g, 0.6, 0.7, 6, mat('#c9ccce', { metalness: 0.4 }), x - w * 0.12, 6, z + d * 0.3, 12);
        meta.stacks.push(new THREE.Vector3(x - w * 0.12, 9.2, z + d * 0.3));
        plane(g, 3.6, 0.9, new THREE.MeshStandardMaterial({ map: plateTexture('H₂', '#ffffff', '#3fa7d6') }), x - w * 0.22, 4.2, z - d * 0.2 + d * 0.25 + 0.05);
        ensureGroup(meta.gid, new THREE.Vector3(x, 7, z), 7);
        addBulb(meta.gid, new THREE.Vector3(x - w * 0.22, 6, z), 0.4, 0.1, new THREE.Color(1.6, 2.2, 2.6));
        break;
      }
      case 'hub':
      case 'hubKalani':
      case 'hubHighvale':
      case 'hubDunefield':
      case 'hubAurora': {
        // HVDC converter station: a long valve hall, a DC yard and towers heading off the tile
        block(g, w + 4, 0.3, d + 4, mat('#b8b2a6'), x, 0.15, z, { r: 0.15, cast: false });
        block(g, w * 0.6, 9, d * 0.5, mat('#dfe5ea'), x, 4.8, z - d * 0.15, { r: 0.4 });
        block(g, w * 0.6 + 0.1, 0.5, d * 0.5 + 0.1, mat(def.color || '#6a4fb3'), x, 7.5, z - d * 0.15, { r: 0.1 });
        for (let i = 0; i < 4; i++) cyl(g, 0.5, 0.7, 6, mat('#c9ccce', { metalness: 0.4 }), x - w * 0.25 + i * (w * 0.17), 3.2, z + d * 0.3, 10);
        for (const k of [0, 1, 2]) lattice(g, x + (def.dirX ?? 1) * (w / 2 + 8 + k * 34), z + (def.dirZ ?? 0) * (k * 34), 24);
        plane(g, w * 0.4, 1.4, new THREE.MeshStandardMaterial({ map: plateTexture(def.label || 'HVDC', '#ffffff', def.color || '#6a4fb3') }), x, 6, z - d * 0.15 + d * 0.25 + 0.06);
        ensureGroup(meta.gid, new THREE.Vector3(x, 10, z), 10);
        addBulb(meta.gid, new THREE.Vector3(x, 8, z + d * 0.1), 0.5, 0.1, new THREE.Color(2.0, 1.6, 2.6));
        break;
      }
      case 'market':
      case 'import': {
        // interconnector: switchyard + towers marching off the tile
        block(g, w, 0.3, d, mat('#b8b2a6'), x, 0.15, z, { r: 0.15, cast: false });
        for (let i = 0; i < 3; i++) block(g, 2.6, 2.6, 2.2, mat(PAL.steel, { metalness: 0.35 }), x - w / 4 + i * (w / 4), 1.5, z, { r: 0.2 });
        for (const k of [0, 1, 2]) lattice(g, x + (def.dirX ?? -1) * (w / 2 + 6 + k * 34), z, 20);
        ensureGroup(meta.gid, new THREE.Vector3(x, 6, z), 6);
        addBulb(meta.gid, new THREE.Vector3(x, 4, z + d / 2), 0.4, 0.1, new THREE.Color(2.4, 2.0, 1.4));
        break;
      }
      case 'solar': {
        // solar farm rows (reso/graphic image 46)
        const panelMat = new THREE.MeshStandardMaterial({ color: '#2b4f8a', roughness: 0.25, metalness: 0.4 });
        const frameMat = mat('#e9e4da');
        const rows = Math.max(2, Math.floor(d / 6));
        const cols = Math.max(1, Math.floor(w / 12));
        for (let r = 0; r < rows; r++)
          for (let k = 0; k < cols; k++) {
            const px = x - w / 2 + 6 + k * 12;
            const pz = z - d / 2 + 3 + r * 6;
            const p = block(g, 11, 0.25, 4.2, frameMat, px, 1.6, pz, { r: 0.06 });
            p.rotation.x = -0.45;
            const pv = block(g, 10.4, 0.2, 3.7, panelMat, px, 1.72, pz, { r: 0.04, cast: false });
            pv.rotation.x = -0.45;
          }
        ensureGroup(meta.gid, new THREE.Vector3(x, 3, z), 3);
        break;
      }
      case 'wind': {
        const n = def.turbines || 1;
        for (let i = 0; i < n; i++) {
          const tb = turbine(g, x + (n > 1 ? -w / 2 + (w / (n - 1 || 1)) * i : 0), z + (i % 2 ? d / 4 : -d / 4) * (n > 1 ? 1 : 0), def.y0 || 0, def.scale || 0.8);
          tb.src = def.id;
          meta.turbines.push(tb);
        }
        break;
      }
      case 'battery': {
        // battery storage yard: rows of containers with status lights
        block(g, w, 0.3, d, mat('#b8b2a6'), x, 0.15, z, { r: 0.12, cast: false });
        const n = Math.max(2, Math.floor(w / 4));
        const ledM = new THREE.MeshStandardMaterial({ color: '#3fbf6b', emissive: '#3fff7a', emissiveIntensity: 0.6 });
        for (let i = 0; i < n; i++) {
          block(g, 3, 3, d * 0.6, mat('#eef0f1'), x - w / 2 + 2.2 + i * 3.8, 1.8, z, { r: 0.25 });
          block(g, 3.05, 0.4, d * 0.6 + 0.05, mat('#3d6fa8'), x - w / 2 + 2.2 + i * 3.8, 3.1, z, { r: 0.08 });
          block(g, 0.5, 0.3, 0.1, ledM, x - w / 2 + 2.2 + i * 3.8, 2.4, z + d * 0.3 + 0.05, { r: 0.04, cast: false });
        }
        meta.ledMat = ledM;
        ensureGroup(meta.gid, new THREE.Vector3(x, 4, z), 4);
        break;
      }
    }
    sources[def.id] = meta;
    return meta;
  }
  function removeSource(id) {
    const m = sources[id];
    if (!m) return;
    root.remove(m.group);
    m.group.traverse((o) => o.geometry && !Object.values(geos).includes(o.geometry) && o.geometry !== coolingLathe && o.geometry.dispose?.());
    for (const t of m.turbines) turbines.splice(turbines.indexOf(t), 1);
    delete sources[id];
  }
  let generator = null;
  if (map.generator) {
    const ph = powerhouse(map.generator);
    generator = { beacon: ph.beacon, beaconMat: ph.beaconMat, fan: ph.fan, stackTop: ph.stackTop, stackTop2: ph.stackTop2 };
    sources.gen = { id: 'gen', type: 'diesel', group: ph.group, stacks: ph.stacks, beaconMat: ph.beaconMat, fan: ph.fan, coolingTowers: [], turbines: [], gid: 'genyard' };
  }
  for (const def of map.sources || []) buildSource(def);

  // ---------------------------------------------------------------- depot (image 54 garage)
  const dep = map.depot;
  const depG = new THREE.Group();
  depG.position.set(dep.x, 0, dep.z);
  depG.rotation.y = Math.PI; // doors face the road (−z)
  root.add(depG);
  block(root, dep.w + 16, 0.3, dep.d + 10, mat(PAL.concrete), dep.x + 5, 0.15, dep.z - 1, { r: 0.12, cast: false });
  block(depG, dep.w, 5.6, dep.d, mat('#e6d2a6'), 0, 3.1, 0, { r: 0.35 });
  const dpar = mat('#cbb994');
  block(depG, dep.w + 0.4, 0.8, 0.5, dpar, 0, 6.2, dep.d / 2 - 0.05, { r: 0.15 }); // parapet ring
  block(depG, dep.w + 0.4, 0.8, 0.5, dpar, 0, 6.2, -dep.d / 2 + 0.05, { r: 0.15 });
  block(depG, 0.5, 0.8, dep.d, dpar, dep.w / 2 - 0.05, 6.2, 0, { r: 0.15 });
  block(depG, 0.5, 0.8, dep.d, dpar, -dep.w / 2 + 0.05, 6.2, 0, { r: 0.15 });
  block(depG, dep.w - 0.4, 0.14, dep.d - 0.4, mat('#56514c', { roughness: 1 }), 0, 5.95, 0, { r: 0.04, cast: false }); // roof deck
  block(depG, 2.6, 1.2, 2.0, mat(PAL.steel, { metalness: 0.3 }), -4, 6.5, -2, { r: 0.18 });
  block(depG, 3.4, 0.4, 2.2, mat('#bfe2ea', { roughness: 0.2, metalness: 0.2 }), 4, 6.15, 1, { r: 0.1 });
  const roller = new THREE.MeshStandardMaterial({ map: ribTexture('#9ea5aa'), roughness: 0.55, metalness: 0.25 });
  for (const dx of [-4.2, 2.6]) block(depG, 5.2, 4.0, 0.3, roller, dx, 2.3, dep.d / 2 + 0.05, { r: 0.08, cast: false });
  block(depG, 1.2, 2.4, 0.25, mat('#3d4f5c'), 7.2, 1.5, dep.d / 2 + 0.05, { r: 0.06, cast: false });
  block(depG, 2.4, 1.8, 1.4, mat(PAL.steel, { metalness: 0.3 }), -dep.w / 2 - 0.8, 1.2, -2, { r: 0.18 }); // AC unit
  plane(depG, 7, 1.6, new THREE.MeshStandardMaterial({ map: plateTexture('GRID OPS', '#2c2f33', '#ffc531') }), -0.8, 4.9, dep.d / 2 + 0.2);
  ensureGroup('depot', new THREE.Vector3(dep.x, 6, dep.z), 6);
  facadeWindows('depot', depG, dep.w, dep.d, 5.6, 1, 3, 2, 1.6, 1.1, (face) => face === 'front', 0.3);
  addPool('depot', dep.x, dep.z - 9, 24, '#ffe2b0', 0.32);
  // yard: pole stack, cable drums, traffic cones
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 8, 10), mat(PAL.wood));
    p.rotation.z = Math.PI / 2;
    p.position.set(dep.x + 13.5, 0.55 + Math.floor(i / 3) * 0.52, dep.z - 3 + (i % 3) * 0.56);
    p.castShadow = true;
    root.add(p);
  }
  for (let i = 0; i < 2; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.1, 20), mat('#a8774a'));
    d.rotation.x = Math.PI / 2;
    d.position.set(dep.x + 12 + i * 2.8, 1.25, dep.z + 4.5);
    d.castShadow = true;
    root.add(d);
    cyl(root, 0.5, 0.5, 1.16, mat('#4a3a2a'), dep.x + 12 + i * 2.8, 1.25, dep.z + 4.5).rotation.x = Math.PI / 2;
  }
  for (const [x, z] of [[dep.x - 9, dep.z - 10], [dep.x - 6, dep.z - 11], [dep.x - 3, dep.z - 10.5]]) {
    cyl(root, 0.08, 0.5, 1.2, mat('#f0782e'), x, 0.6, z, 12);
    cyl(root, 0.24, 0.32, 0.22, mat('#f4f0e6'), x, 0.72, z, 12);
  }
  cyl(root, 0.14, 0.16, 7, mat('#3f4a3c'), dep.x - 10, 3.5, dep.z - 10, 8);
  addBulb('depot', new THREE.Vector3(dep.x - 10, 7.1, dep.z - 10), 0.45, 0.1, new THREE.Color(2.4, 2.0, 1.4));

  // ---------------------------------------------------------------- street lights
  ensureGroup('street-n', new THREE.Vector3(30, 6, -10), 6);
  ensureGroup('street-s', new THREE.Vector3(30, 6, 10), 6);
  const lampMat = mat('#3c4a3d', { roughness: 0.6 });
  const lamps = [];
  if (!map.lampRoads) {
    for (let x = -30; x <= 100; x += 26) lamps.push([x, -6.4, 'street-n', 1], [x + 13, 6.4, 'street-s', -1]);
    for (let z = -80; z <= 80; z += 26) if (Math.abs(z) > 10) lamps.push([45.6, z, z < 0 ? 'street-n' : 'street-s', 0]);
  } else {
    // lamps along the town roads listed by the map, alternating sides every 28 m
    const zc = map.townCenterZ ?? 0;
    for (const rid of map.lampRoads) {
      const r = map.roads.find((o) => o.id === rid);
      if (!r) continue;
      const along = r.w > r.d;
      const len = along ? r.w : r.d;
      let k = 0;
      for (let t = -len / 2 + 10; t < len / 2 - 10; t += 28, k++) {
        const side = k % 2 ? 1 : -1;
        const x = along ? r.x + t : r.x + side * (r.w / 2 + 2.4);
        const z = along ? r.z + side * (r.d / 2 + 2.4) : r.z + t;
        if (map.roads.some((o) => o !== r && rectDist(x, z, o) < 3)) continue;
        if (map.customers.some((c) => rectDist(x, z, c) < 1.5)) continue;
        lamps.push(along ? [x, z, z < zc ? 'street-n' : 'street-s', -side] : [x, z, z < zc ? 'street-n' : 'street-s', 0]);
      }
    }
  }
  lamps.forEach(([x, z, gid, side], i) => {
    cyl(root, 0.13, 0.17, 6, lampMat, x, 3, z, 8);
    const head = block(root, 1.6, 0.35, 0.6, lampMat, x + (side === 0 ? -0.6 : 0), 6.1, z + side * 0.6, { r: 0.12, cast: false, ry: side === 0 ? Math.PI / 2 : 0 });
    void head;
    addBulb(gid, new THREE.Vector3(x + (side === 0 ? -0.9 : 0), 5.85, z + side * 0.9), 0.32, (i % 7) / 8 + 0.05, new THREE.Color(2.3, 1.7, 1.0));
    addPool(gid, x, z, 12, '#ffcf8a', 0.24);
  });

  // ---------------------------------------------------------------- satellite islands (preview of later stages)
  const IS = [];
  const sat = (cx, cz, w, d, top) => {
    island(root, cx, cz, w, d, Math.min(w, d) * 0.22, top, 14);
    IS.push({ cx, cz, w, d, top });
    return top;
  };
  const coolingTowers = [];
  const satTrees = [];
  ensureGroup('neighbour', new THREE.Vector3(0, 6, 0), 6);
  const DECOR = {
    windfarm(o) {
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      const n = o.n ?? 5;
      for (let i = 0; i < n; i++) {
        const tz = o.z - o.d / 2 + 30 + (i * (o.d - 60)) / Math.max(1, n - 1);
        const tx = o.x + (i % 2 ? 16 : -18);
        turbine(root, tx, tz, top);
      }
      if (o.solar !== false) {
        const panelMat = new THREE.MeshStandardMaterial({ color: '#2b4f8a', roughness: 0.25, metalness: 0.4 });
        const frameMat = mat('#e9e4da');
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 3; k++) {
            const x = o.x + 5 + k * 13;
            const z = o.z + o.d / 2 - 45 + r * 7;
            const pp = block(root, 11, 0.25, 4.2, frameMat, x, top + 1.6, z, { r: 0.06 });
            pp.rotation.x = -0.45;
            const pv = block(root, 10.4, 0.2, 3.7, panelMat, x, top + 1.72, z, { r: 0.04, cast: false });
            pv.rotation.x = -0.45;
          }
      }
    },
    powerstation(o) {
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      const ctMat = mat('#d9d3c7', { side: THREE.DoubleSide, roughness: 0.9 });
      [[o.x - 30, o.z - 10], [o.x + 8, o.z - 36]].forEach(([x, z]) => {
        const m = new THREE.Mesh(coolingLathe, ctMat);
        m.position.set(x, top, z);
        m.castShadow = true;
        root.add(m);
        const band = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.5, 8, 40), mat('#c8502b'));
        band.rotation.x = Math.PI / 2;
        band.position.set(x, top + 41, z);
        root.add(band);
        coolingTowers.push({ x, z, top: top + 46, r: 9 });
      });
      const pg = new THREE.Group();
      pg.position.set(o.x + 30, top, o.z + 22);
      root.add(pg);
      block(pg, 26, 9, 14, mat('#b5563b'), 0, 4.5, 0, { r: 0.4 });
      gable(pg, 26, 14, 9, 3.2, mat('#b5563b'), new THREE.MeshStandardMaterial({ color: '#8d9399', map: ribTexture('#a3a8ad'), roughness: 0.6 }), 0.6);
      cyl(pg, 1.3, 1.6, 22, mat('#e9d6ae'), 9, 11, -3, 16);
      lattice(root, o.x + 60, o.z - 10, 30, top);
    },
    town(o) {
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      const spots = [];
      for (let i = 0; i < 18; i++) spots.push([o.x - 60 + (i % 6) * 22 + (R() - 0.5) * 6, o.z - 55 + Math.floor(i / 6) * 40 + (R() - 0.5) * 6]);
      spots.forEach(([x, z], i) => {
        if (i === 8) return;
        const hg = new THREE.Group();
        hg.position.set(x, top, z);
        hg.rotation.y = (Math.floor(R() * 4) * Math.PI) / 2;
        root.add(hg);
        const wm = mat(PAL.walls[i % PAL.walls.length]);
        const wh = 4 + R() * 2.5;
        block(hg, 9, wh, 7, wm, 0, wh / 2, 0, { r: 0.3 });
        gable(hg, 9, 7, wh, 2.8, wm, roof(PAL.roofs[i % PAL.roofs.length]), 0.7);
        hg.updateMatrixWorld(true);
        for (let k = 0; k < 4; k++) {
          const pt = new THREE.Vector3(-2.5 + (k % 2) * 5, 1.6 + Math.floor(k / 2) * 2.2, 3.6).applyMatrix4(hg.matrixWorld);
          if (pt.y - top < wh) addBulb('neighbour', pt, 0.55, 0.1, WARM);
        }
      });
      const ch = new THREE.Group();
      ch.position.set(spots[8][0], top, spots[8][1]);
      root.add(ch);
      const cw = mat('#f1e4c6');
      block(ch, 14, 7, 9, cw, 0, 3.5, 0, { r: 0.3 });
      gable(ch, 14, 9, 7, 4.2, cw, roof('#cf5a2c'), 0.6);
      block(ch, 4, 14, 4, cw, -8, 7, 0, { r: 0.25 });
      const spire = new THREE.Mesh(new THREE.ConeGeometry(3.0, 7, 4), mat('#c8502b'));
      spire.position.set(-8, 17.5, 0);
      spire.rotation.y = Math.PI / 4;
      spire.castShadow = true;
      ch.add(spire);
      addBulb('neighbour', new THREE.Vector3(spots[8][0] - 8, top + 10, spots[8][1] + 2.1), 0.7, 0.1, WARM);
      for (let i = 0; i < 90; i++) {
        const tx = o.x - 75 + R() * 155;
        const tz = o.z - 75 + R() * 150;
        if (spots.every(([x, z]) => Math.hypot(tx - x, tz - z) > 9)) satTrees.push([tx, tz, 1.8 + R() * 2, top, R() < 0.35]);
      }
    },
    city(o) {
      // skyline preview (Stage 5): towers and blocks with lit windows
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      for (let i = 0; i < 24; i++) {
        const x = o.x - o.w / 2 + 18 + (i % 6) * ((o.w - 36) / 5);
        const z = o.z - o.d / 2 + 18 + Math.floor(i / 6) * ((o.d - 36) / 3);
        const hh = 8 + R() * (i % 5 === 0 ? 40 : 18);
        const wcol = ['#d9e0d2', '#e9e2d4', '#9fb5c4', '#efe2c4'][i % 4];
        block(root, 10, hh, 10, mat(wcol, { roughness: 0.5 }), x, top + hh / 2, z, { r: 0.4 });
        for (let k = 0; k < Math.floor(hh / 4); k++) addBulb('neighbour', new THREE.Vector3(x + (R() - 0.5) * 6, top + 2 + k * 4, z + 5.05), 0.5, 0.1, WARM);
      }
      for (let i = 0; i < 40; i++) satTrees.push([o.x - o.w / 2 + R() * o.w, o.z + (R() < 0.5 ? -1 : 1) * (o.d / 2 - 6), 1.6 + R() * 1.4, top, false]);
    },
    port(o) {
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      const crane = mat('#f2b630', { roughness: 0.5 });
      for (let i = 0; i < 3; i++) {
        const x = o.x - o.w / 3 + i * (o.w / 3);
        block(root, 0.9, 20, 0.9, crane, x, top + 10, o.z, { r: 0.15 });
        block(root, 18, 0.9, 0.9, crane, x + 6, top + 19.5, o.z, { r: 0.15 });
      }
      const cont = ['#d9443a', '#3d6fa8', '#3f8f6b', '#e9862c'];
      for (let i = 0; i < 18; i++) block(root, 6, 2.5, 2.4, mat(cont[i % 4]), o.x - o.w / 2 + 12 + (i % 6) * 7, top + 1.4 + Math.floor(i / 6) * 2.55, o.z + o.d / 4, { r: 0.1 });
    },
    lake(o) {
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      const lake = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(o.w * 0.53, o.d * 0.41, 30), 16), new THREE.MeshStandardMaterial({ color: '#2f7fa3', roughness: 0.15, metalness: 0.1 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(o.x, top + 0.12, o.z - 5);
      root.add(lake);
      const shore = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(o.w * 0.57, o.d * 0.46, 34), 16), mat('#d9c08c'));
      shore.rotation.x = -Math.PI / 2;
      shore.position.set(o.x, top + 0.06, o.z - 5);
      root.add(shore);
      for (let i = 0; i < 140; i++) {
        const a = R() * Math.PI * 2;
        const rr = 62 + R() * 26;
        satTrees.push([o.x + Math.cos(a) * rr * (o.w / 190), o.z - 5 + Math.sin(a) * rr * 0.8 * (o.d / 170), 2 + R() * 2.4, top, R() < 0.75]);
      }
    },
    farm(o) {
      const top = sat(o.x, o.z, o.w, o.d, o.top);
      const soilM = mat('#8a5a34');
      const cropM = mat('#7fb03c');
      const wheatM = mat('#e2b84a');
      for (let f = 0; f < 3; f++) {
        const fx = o.x - 70 + f * 46;
        block(root, 38, 0.3, 54, soilM, fx, top + 0.15, o.z, { r: 0.2, cast: false });
        for (let r = 0; r < 9; r++) block(root, 36, 0.7, 1.8, f === 1 ? wheatM : cropM, fx, top + 0.6, o.z - 24 + r * 6, { r: 0.3, cast: false });
      }
      const bg = new THREE.Group();
      bg.position.set(o.x + 75, top, o.z - 10);
      root.add(bg);
      const red = mat('#b33a2e');
      block(bg, 14, 7, 11, red, 0, 3.5, 0, { r: 0.3 });
      gable(bg, 14, 11, 7, 4, red, roof('#6b4a36'), 0.6);
      block(bg, 4.4, 5, 0.3, mat('#f4ead6'), 0, 2.6, 5.6, { r: 0.08 });
      cyl(bg, 3, 3, 15, mat('#d8cfbf'), -10, 7.5, -2, 20);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9aa0a6', { metalness: 0.3 }));
      dome.position.set(-10, 15, -2);
      bg.add(dome);
      for (let i = 0; i < 40; i++) satTrees.push([o.x - 95 + R() * 190, o.z - 41 + R() * 5 + (R() < 0.5 ? 0 : 76), 1.8 + R() * 1.6, top, R() < 0.3]);
    },
  };
  const decor = map.decor ?? [
    { kind: 'windfarm', x: 340, z: -20, w: 120, d: 270, top: -10 },
    { kind: 'powerstation', x: -320, z: -290, w: 190, d: 160, top: -12 },
    { kind: 'town', x: 370, z: -370, w: 180, d: 170, top: -8 },
    { kind: 'lake', x: -330, z: 280, w: 190, d: 170, top: -10 },
    { kind: 'farm', x: 30, z: 330, w: 210, d: 100, top: -9 },
  ];
  for (const o of decor) DECOR[o.kind]?.(o);

  // ---------------------------------------------------------------- trees + bushes (instanced, main tile + islands)
  const treeSpots = [];
  const gen = map.generator;
  const clear = map.clear ?? [{ x: -60, z: 0, w: 80, d: 52 }]; // keep the generator→town corridor open
  const core = map.core ?? [{ x: 34, z: 1, w: 132, d: 126 }]; // town core mostly open
  const blocked = (x, z) => {
    const lx = x - T.cx;
    const lz = z - T.cz;
    if (Math.abs(lx) > T.hw - 8 || Math.abs(lz) > T.hd - 8) return true;
    const cr = T.radius + 8;
    const ax = Math.abs(lx) - (T.hw - cr);
    const az = Math.abs(lz) - (T.hd - cr);
    if (ax > 0 && az > 0 && Math.hypot(ax, az) > cr - 8) return true;
    for (const r of map.roads) if (rectDist(x, z, r) < 5) return true;
    for (const c of map.customers) if (rectDist(x, z, c) < 7) return true;
    if (gen && rectDist(x, z, { x: gen.x, z: gen.z, w: gen.w + 18, d: gen.d + 18 }) < 1) return true;
    for (const so of [...(map.sources || []), ...(map.sites || [])]) if (rectDist(x, z, { x: so.x, z: so.z, w: (so.w || 16) + 14, d: (so.d || 12) + 14 }) < 1) return true;
    for (const wtr of map.water || []) if (rectDist(x, z, wtr) < 6) return true;
    for (const hl of map.hills || []) if (Math.hypot(x - hl.x, (z - hl.z) / (hl.squash ?? 1)) < hl.r * 0.55) return R() > 0.15;
    if (rectDist(x, z, { x: dep.x + 6, z: dep.z, w: dep.w + 24, d: dep.d + 18 }) < 1) return true;
    for (const c0 of clear) if (rectDist(x, z, c0) < 1) return true;
    for (const c0 of core) if (rectDist(x, z, c0) < 1) return R() > 0.07;
    return false;
  };
  const nTrees = Math.min(1900, Math.round(((1500 * (T.hw * T.hd)) / (224 * 224)) * (map.treeDensity ?? 1)));
  for (let i = 0; i < nTrees; i++) {
    const x = T.cx + (R() * 2 - 1) * T.hw;
    const z = T.cz + (R() * 2 - 1) * T.hd;
    // denser toward the tile rim
    const edge = Math.max(Math.abs(x - T.cx) / T.hw, Math.abs(z - T.cz) / T.hd);
    if (R() > 0.25 + edge * 0.9) continue;
    if (blocked(x, z)) continue;
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const tx = x + (R() - 0.5) * 8;
      const tz = z + (R() - 0.5) * 8;
      if (!blocked(tx, tz)) treeSpots.push([tx, tz, 1.8 + R() * 1.8, 0, R() < (map.palms ? 0.65 : 0.3)]);
    }
  }
  treeSpots.push(...satTrees);
  {
    const broad = treeSpots.filter((t) => !t[4]);
    const pines = treeSpots.filter((t) => t[4]);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 2);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const canopy = new THREE.InstancedMesh(canopyGeo, leafMat, broad.length * 3 + bushSpots.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 7), mat('#6b4a2f'), broad.length + pines.length);
    const pineGeo = new THREE.ConeGeometry(1, 1, 9);
    const pine = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), pines.length * 3);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let k = 0;
    let tk = 0;
    broad.forEach(([x, z, s, y0]) => {
      const h = s * 1.1;
      const hue = 0.22 + R() * 0.07;
      const blobs = [[0, h + s * 0.9, 0, s, s * 1.05], [s * 0.55, h + s * 0.55, s * 0.25, s * 0.7, s * 0.68], [-s * 0.45, h + s * 0.6, -s * 0.3, s * 0.72, s * 0.7]];
      for (const [dx, dy, dz, r, ry] of blobs) {
        m4.compose(v.set(x + dx, y0 + dy, z + dz), q, sc.set(r, ry, r));
        canopy.setMatrixAt(k, m4);
        canopy.setColorAt(k++, col.setHSL(hue + (R() - 0.5) * 0.02, 0.55 + R() * 0.12, 0.2 + R() * 0.07));
      }
      m4.compose(v.set(x, y0 + h / 2, z), q, sc.set(1, h, 1));
      trunk.setMatrixAt(tk++, m4);
    });
    bushSpots.forEach(([x, z, s]) => {
      m4.compose(v.set(x, s * 0.55, z), q, sc.set(s, s * 0.8, s));
      canopy.setMatrixAt(k, m4);
      canopy.setColorAt(k++, col.setHSL(0.25 + R() * 0.05, 0.55, 0.2 + R() * 0.05));
    });
    let pk = 0;
    // tropical maps: the "pine" share becomes palms (tall leaning trunk, a crown of long fronds)
    const palmGeo = new THREE.SphereGeometry(1, 8, 4);
    const fronds = map.palms ? new THREE.InstancedMesh(palmGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), pines.length * 6) : null;
    let fk = 0;
    if (map.palms) {
      const e = new THREE.Euler();
      pines.forEach(([x, z, s, y0]) => {
        const hh = s * 3.2;
        const lean = (R() - 0.5) * 0.25;
        q.setFromEuler(e.set(lean, 0, lean * 0.6));
        m4.compose(v.set(x, y0 + hh / 2, z), q, sc.set(0.7, hh, 0.7));
        trunk.setMatrixAt(tk++, m4);
        const tx = x + Math.sin(lean * 0.6) * hh * -0.5;
        const tz = z + Math.sin(lean) * hh * 0.5;
        const top = y0 + hh;
        for (let f = 0; f < 6; f++) {
          const a = (f / 6) * Math.PI * 2 + R() * 0.4;
          q.setFromEuler(e.set(0.35, -a, 0, 'YXZ'));
          m4.compose(v.set(tx + Math.cos(a) * s * 0.9, top - s * 0.15, tz + Math.sin(a) * s * 0.9), q, sc.set(s * 1.25, s * 0.12, s * 0.38));
          fronds.setMatrixAt(fk, m4);
          fronds.setColorAt(fk++, col.setHSL(0.27 + R() * 0.05, 0.5 + R() * 0.1, 0.22 + R() * 0.06));
        }
      });
      q.identity();
    }
    if (!map.palms) pines.forEach(([x, z, s, y0]) => {
      const hh = s * 1.4;
      m4.compose(v.set(x, y0 + hh * 0.5, z), q, sc.set(1, hh, 1));
      trunk.setMatrixAt(tk++, m4);
      for (let t = 0; t < 3; t++) {
        const r = s * (1.15 - t * 0.28);
        m4.compose(v.set(x, y0 + hh + t * s * 0.95 + s * 0.4, z), q, sc.set(r, s * 1.5, r));
        pine.setMatrixAt(pk, m4);
        pine.setColorAt(pk++, col.setHSL(0.37 + R() * 0.04, 0.42 + R() * 0.08, 0.14 + R() * 0.04));
      }
    });
    canopy.count = k;
    pine.count = pk;
    if (fronds) {
      fronds.count = fk;
      fronds.castShadow = true;
      root.add(fronds);
    }
    for (const im of [canopy, trunk, pine]) {
      im.castShadow = true;
      im.receiveShadow = true;
      root.add(im);
    }
  }

  // ---------------------------------------------------------------- instanced windows (frame + glass) and bulbs
  const SPARE = 160; // room for sources and homes added during play
  frameMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat(PAL.cream, { roughness: 0.7 }), winXf.length + SPARE);
  winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), winXf.length + SPARE);
  bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbXf.length + SPARE);
  frameMesh.count = winMesh.count = winXf.length;
  bulbMesh.count = bulbXf.length;
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const off = new THREE.Vector3();
    for (let i = winXf.length; i < winXf.length + SPARE; i++) winMesh.setColorAt(i, GLASS_DAY);
    for (let i = bulbXf.length; i < bulbXf.length + SPARE; i++) bulbMesh.setColorAt(i, GLASS_NIGHT);
    winXf.forEach((w, i) => {
      q.setFromEuler(e.set(0, w.rotY, 0));
      off.set(0, 0, -0.03).applyQuaternion(q);
      m4.compose(w.pos.clone().add(off), q, new THREE.Vector3(w.w + 0.42, w.h + 0.42, 1));
      frameMesh.setMatrixAt(i, m4);
      m4.compose(w.pos, q, new THREE.Vector3(w.w, w.h, 1));
      winMesh.setMatrixAt(i, m4);
      winMesh.setColorAt(i, GLASS_DAY);
    });
    bulbXf.forEach((b, i) => {
      m4.compose(b.pos, q.identity(), new THREE.Vector3(b.size, b.size, b.size));
      bulbMesh.setMatrixAt(i, m4);
      bulbMesh.setColorAt(i, GLASS_NIGHT);
    });
    frameMesh.receiveShadow = true;
    root.add(frameMesh, winMesh, bulbMesh);
  }
  poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), poolXf.length + SPARE);
  poolMesh.frustumCulled = false;
  poolXf.forEach(placePool);
  poolMesh.count = poolXf.length;
  root.add(poolMesh);

  groups.neighbour.target = 1;
  groups.depot.target = 1;
  if (groups.genyard) groups.genyard.target = 1;
  turbines.forEach((t) => (groups[t.gid].target = 1));
  for (const id in sources) if (groups[sources[id].gid] && sources[id].gid !== 'genyard') groups[sources[id].gid].target = 1;

  // ---------------------------------------------------------------- static batching
  // Many small static meshes share a handful of cached materials. Merge them per
  // material (per building / source group, and per 160 m cell for scenery) so a big
  // map costs a few hundred draw calls instead of thousands. Animated or
  // individually-driven parts (fans, rotors, light pools, signs) stay separate.
  const keepLive = new Set();
  const markLive = (o) => o && keepLive.add(o);
  function mergeStatic(container, cell = 0, stop = new Set()) {
    container.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
    const buckets = new Map();
    const tmp = new THREE.Matrix4();
    const wp = new THREE.Vector3();
    (function walk(o) {
      for (const c of o.children) {
        if (stop.has(c) || keepLive.has(c) || c.visible === false) continue;
        if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !Array.isArray(c.material) && c.geometry?.attributes?.position && !c.material.transparent) {
          const g = c.geometry;
          const attrs = Object.keys(g.attributes).sort().join(',');
          let ck = '';
          if (cell) {
            c.getWorldPosition(wp);
            ck = Math.floor(wp.x / cell) + ':' + Math.floor(wp.z / cell);
          }
          const key = c.material.uuid + '|' + c.castShadow + c.receiveShadow + '|' + !!g.index + '|' + attrs + '|' + g.groups.length + '|' + ck;
          (buckets.get(key) || buckets.set(key, []).get(key)).push(c);
        }
        if (!(c.isMesh && keepLive.has(c))) walk(c);
      }
    })(container);
    let merged = 0;
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = [];
      for (const m of list) {
        const g = m.geometry.clone();
        if (g.groups.length) g.clearGroups();
        g.applyMatrix4(tmp.multiplyMatrices(inv, m.matrixWorld));
        if (m.matrixWorld.determinant() < 0 && g.index) {
          const ix = g.index.array;
          for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        }
        geos.push(g);
      }
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const mm = new THREE.Mesh(geo, list[0].material);
      mm.castShadow = list[0].castShadow;
      mm.receiveShadow = list[0].receiveShadow;
      mm.userData.merged = list.length;
      for (const m of list) {
        m.parent.remove(m);
        if (m.children.length) for (const ch of [...m.children]) container.attach(ch);
      }
      container.add(mm);
      merged += list.length - 1;
    }
    return merged;
  }
  function batchStatic() {
    for (const id in groups) {
      for (const sg of groups[id].signs) markLive(sg.mesh);
    }
    const dynamicRoots = new Set();
    for (const t of turbines) markLive(t.hub);
    for (const id in sources) {
      markLive(sources[id].fan);
      markLive(sources[id].beacon);
      dynamicRoots.add(sources[id].group);
    }
    if (generator) markLive(generator.beacon), markLive(generator.fan);
    for (const id in buildings) {
      if (buildings[id].pv) {
        markLive(buildings[id].pv);
        mergeStatic(buildings[id].pv);
      }
      dynamicRoots.add(buildings[id].group);
      if (buildings[id].plot) dynamicRoots.add(buildings[id].plot);
    }
    dynamicRoots.delete(undefined);
    for (const g of dynamicRoots) if (g?.parent) mergeStatic(g);
    mergeStatic(root, 160, dynamicRoots);
  }
  batchStatic();

  // ---------------------------------------------------------------- per-frame lighting
  const col = new THREE.Color();
  const glass = new THREE.Color();
  const bulbOff = new THREE.Color();
  function update(dt, time, nightFactor, reduceMotion) {
    const nk = THREE.MathUtils.clamp((nightFactor - 0.3) / 0.7, 0, 1); // 0 = full day, 1 = night
    glass.copy(GLASS_DAY).lerp(GLASS_NIGHT, nk);
    bulbOff.copy(GLASS_DAY).multiplyScalar(0.6).lerp(GLASS_NIGHT, nk);
    for (const id in groups) {
      const g = groups[id];
      const speed = g.target > g.level ? 0.55 : 2.2; // slow staggered light-up, quick blackout
      g.level += Math.sign(g.target - g.level) * Math.min(Math.abs(g.target - g.level), dt * speed);
      for (const p of g.pools) poolMesh.setColorAt(p.idx, _poolC.copy(p.color).multiplyScalar(p.maxOpacity * g.level * nk * nk));
      for (const s of g.signs) s.mesh.material.emissiveIntensity = s.emissive * g.level * (0.25 + 0.75 * nk);
    }
    const flick = Math.floor(time * 9);
    for (const L of lights) {
      const g = groups[L.g];
      let on = L.lit && g.level > L.thr;
      if (on && g.partial && !reduceMotion && (L.idx * 31 + flick) % 11 === 0) on = false;
      const off = L.mesh === 'win' ? glass : bulbOff;
      const target = on ? (L.mesh === 'win' ? col.copy(GLASS_DAY).lerp(WARM_DIM.copy(L.color).multiplyScalar(0.55), 0.2 + 0.8 * nk).lerp(L.color, nk * nk) : col.copy(L.color).multiplyScalar(0.45 + 0.55 * nk)) : off;
      (L.mesh === 'win' ? winMesh : bulbMesh).setColorAt(L.idx, target);
    }
    for (const t of turbines) {
      if (!reduceMotion) t.hub.rotation.z += dt * (t.speed ?? 0.9);
      groups[t.gid].level = Math.sin(time * 2.2 + t.phase * 10) > 0.6 ? 1 : 0.05;
    }
    winMesh.instanceColor.needsUpdate = true;
    bulbMesh.instanceColor.needsUpdate = true;
    if (poolMesh.instanceColor) poolMesh.instanceColor.needsUpdate = true;
  }

  function setPower(id, status) {
    const g = groups[id];
    if (!g) return;
    g.target = status === 'on' || status === 'partial' ? 1 : 0;
    g.partial = status === 'partial';
  }
  function setGroupLevel(id, v) {
    if (groups[id]) groups[id].target = v;
  }

  return {
    root,
    buildings,
    groups,
    update,
    setPower,
    setGroupLevel,
    generator,
    coolingTowers: [...coolingTowers, ...Object.values(sources).flatMap((m) => m.coolingTowers || [])],
    sources,
    buildSource(def) {
      const m = buildSource(def);
      markLive(m.fan);
      markLive(m.beacon);
      for (const t of m.turbines) markLive(t.hub);
      if (m.group) mergeStatic(m.group);
      groups[m.gid] && (groups[m.gid].target = 1);
      for (const t of m.turbines) groups[t.gid].target = 1;
      return m;
    },
    removeSource,
    /** Rooftop solar appears when the street joins the solar programme. Returns true if it changed. */
    setSolar(id, on) {
      const pv = buildings[id]?.pv;
      if (!pv || pv.visible === !!on) return false;
      pv.visible = !!on;
      return true;
    },
    /** Growth: a new family moves in — the house replaces its plot. */
    setActive(id, on) {
      const b = buildings[id];
      if (!b) return;
      b.group.visible = !!on;
      if (b.plot) b.plot.visible = !on;
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        o.geometry?.dispose?.();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) m.dispose?.();
      });
    },
  };
}
