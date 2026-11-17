// Static world in the warm "toy diorama" style of reso/graphic: the district sits on a rounded
// grass tile with a soil edge floating in a dark void; chunky gable-roofed buildings, round
// trees and conifers, asphalt roads with white dashes, and satellite islands (wind farm, power
// station, neighbouring town, lake, farm) that preview later stages.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../sim/rng.js';
import { rectDist } from '../sim/grid.js';
import { poolTexture, grassTexture, soilTexture, plateTexture, clockTexture, stripeTexture, hazardTexture, ribTexture, crossTexture, roofTileTexture } from './textures.js';

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
  const T = TILE;
  island(root, 0, 0, T.half * 2, T.half * 2, T.radius, 0, T.depth);

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
      const x0 = Math.max(r.x - r.w / 2, -T.half + 2);
      const x1 = Math.min(r.x + r.w / 2, T.half - 2);
      return { ...r, x: (x0 + x1) / 2, w: x1 - x0 };
    }
    const z0 = Math.max(r.z - r.d / 2, -T.half + 2);
    const z1 = Math.min(r.z + r.d / 2, T.half - 2);
    return { ...r, z: (z0 + z1) / 2, d: z1 - z0 };
  };
  for (const r0 of map.roads) {
    const r = clampLen(r0);
    block(root, r.w + 3.2, 0.22, r.d + 3.2, walkMat, r.x, 0.11, r.z, { r: 0.1, cast: false });
    block(root, r.w, 0.3, r.d, roadMat, r.x, 0.15, r.z, { r: 0.08, cast: false });
    if (r.id === 'main' || r.id === 'cross') {
      const along = r.w > r.d;
      const len = along ? r.w : r.d;
      for (let s = -len / 2 + 3; s < len / 2 - 3; s += 7) {
        const x = along ? r.x + s : r.x;
        const z = along ? r.z : r.z + s;
        if (r.id === 'main' && Math.abs(x - 40) < 8) continue;
        if (r.id === 'cross' && Math.abs(z) < 8) continue;
        marks.push({ x, z, along, w: 3, h: 0.32 });
      }
    }
  }
  // zebra crossings at the junction
  for (const [cx, cz, along] of [[40, -7.5, false], [40, 7.5, false], [31.5, 0, true], [48.5, 0, true]]) {
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

  function addWindow(gid, pos, rotY, w, h, thr) {
    winXf.push({ pos, rotY, w, h });
    lights.push({ g: gid, mesh: 'win', idx: winXf.length - 1, thr, lit: R() < 0.84, color: R() < 0.25 ? WARM_SOFT : WARM });
  }
  function addBulb(gid, pos, size, thr, color = WARM) {
    bulbXf.push({ pos, size });
    lights.push({ g: gid, mesh: 'bulb', idx: bulbXf.length - 1, thr, lit: true, color });
  }
  function addPool(gid, x, z, size, color = '#ffb36b', opacity = 0.5) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.36, z);
    m.userData.maxOpacity = opacity;
    root.add(m);
    groups[gid].pools.push(m);
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
    }
    buildings[c.id] = { group: g, height, c };
  }

  // ---------------------------------------------------------------- generator: brick power house (image 102)
  const gen = map.generator;
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
  ensureGroup('genyard', new THREE.Vector3(gen.x, 8, gen.z), 8);
  facadeWindows('genyard', ph, 9.5, 7.6, 6.9, 1, 3, 2, 1.2, 1.8, (face, lx) => face === 'front' && Math.abs(lx) < 1.8, 0.6);
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
  addBulb('genyard', new THREE.Vector3(gen.x - 9, 6.5, gen.z + 6), 0.45, 0.1, new THREE.Color(2.4, 2.0, 1.4));
  addPool('genyard', gen.x - 7, gen.z + 5, 18, '#ffe2b0', 0.3);

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
  for (let x = -30; x <= 100; x += 26) lamps.push([x, -6.4, 'street-n', 1], [x + 13, 6.4, 'street-s', -1]);
  for (let z = -80; z <= 80; z += 26) if (Math.abs(z) > 10) lamps.push([45.6, z, z < 0 ? 'street-n' : 'street-s', 0]);
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
  // wind farm (east)
  const turbines = [];
  {
    const top = sat(340, -20, 120, 270, -10);
    const towerMat = mat('#f1ece2', { roughness: 0.55 });
    [[322, -125], [356, -70], [320, -15], [358, 40], [326, 95]].forEach(([x, z], i) => {
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
        blade.scale.x = 1;
        const arm = new THREE.Group();
        arm.rotation.z = (b * Math.PI * 2) / 3;
        arm.add(blade);
        hub.add(arm);
      }
      t.add(hub);
      t.position.set(x, top, z);
      t.rotation.y = -Math.PI / 2 + 0.3;
      root.add(t);
      ensureGroup('turb' + i, new THREE.Vector3(x, top + 48, z), 48);
      addBulb('turb' + i, new THREE.Vector3(x, top + 48.2, z), 0.6, 0.1, new THREE.Color(3, 0.2, 0.15));
      turbines.push({ hub, gid: 'turb' + i, phase: i * 0.37 });
    });
    // solar rows
    const panelMat = new THREE.MeshStandardMaterial({ color: '#2b4f8a', roughness: 0.25, metalness: 0.4 });
    const frameMat = mat('#e9e4da');
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 3; k++) {
        const x = 345 + k * 13;
        const z = -150 + r * 7 + 300 * 0;
        const p = block(root, 11, 0.25, 4.2, frameMat, x, top + 1.6, z + 220, { r: 0.06 });
        p.rotation.x = -0.45;
        const pv = block(root, 10.4, 0.2, 3.7, panelMat, x, top + 1.72, z + 220, { r: 0.04, cast: false });
        pv.rotation.x = -0.45;
      }
  }
  // power station (north-west): cooling towers with puffy steam
  const coolingTowers = [];
  {
    const top = sat(-320, -290, 190, 160, -12);
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const y = (i / 14) * 46;
      const r = 15 - Math.sin((i / 14) * Math.PI) * 5.5 - (i / 14) * 2;
      pts.push(new THREE.Vector2(r, y));
    }
    const lathe = new THREE.LatheGeometry(pts, 40);
    const ctMat = mat('#d9d3c7', { side: THREE.DoubleSide, roughness: 0.9 });
    [[-350, -300], [-312, -326]].forEach(([x, z]) => {
      const m = new THREE.Mesh(lathe, ctMat);
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
    pg.position.set(-290, top, -268);
    root.add(pg);
    block(pg, 26, 9, 14, mat('#b5563b'), 0, 4.5, 0, { r: 0.4 });
    gable(pg, 26, 14, 9, 3.2, mat('#b5563b'), new THREE.MeshStandardMaterial({ color: '#8d9399', map: ribTexture('#a3a8ad'), roughness: 0.6 }), 0.6);
    cyl(pg, 1.3, 1.6, 22, mat('#e9d6ae'), 9, 11, -3, 16);
    // lattice transmission tower
    const lat = mat('#5f666b', { metalness: 0.4 });
    const tw = new THREE.Group();
    tw.position.set(-260, top, -300);
    root.add(tw);
    for (const [sx, sz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 30, 6), lat);
      leg.position.set(sx * 0.6, 15, sz * 0.6);
      leg.rotation.set(sz * 0.07, 0, -sx * 0.07);
      tw.add(leg);
    }
    for (const y of [22, 27]) block(tw, 14, 0.4, 0.4, lat, 0, y, 0, { r: 0.1 });
  }
  // neighbouring, already-powered town (north-east) with a church
  ensureGroup('neighbour', new THREE.Vector3(360, 6, -360), 6);
  const satTrees = [];
  {
    const top = sat(370, -370, 180, 170, -8);
    const spots = [];
    for (let i = 0; i < 18; i++) {
      const x = 310 + (i % 6) * 22 + (R() - 0.5) * 6;
      const z = -425 + Math.floor(i / 6) * 40 + (R() - 0.5) * 6;
      spots.push([x, z]);
    }
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
        const p = new THREE.Vector3(-2.5 + (k % 2) * 5, 1.6 + Math.floor(k / 2) * 2.2, 3.6).applyMatrix4(hg.matrixWorld);
        if (p.y - top < wh) addBulb('neighbour', p, 0.55, 0.1, WARM);
      }
    });
    // church
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
      const tx = 295 + R() * 155;
      const tz = -445 + R() * 150;
      if (spots.every(([x, z]) => Math.hypot(tx - x, tz - z) > 9)) satTrees.push([tx, tz, 1.8 + R() * 2, top, R() < 0.35]);
    }
  }
  // lake and pine forest (south-west)
  {
    const top = sat(-330, 280, 190, 170, -10);
    const lake = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(100, 70, 30), 16), new THREE.MeshStandardMaterial({ color: '#2f7fa3', roughness: 0.15, metalness: 0.1 }));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(-330, top + 0.12, 275);
    root.add(lake);
    const shore = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(108, 78, 34), 16), mat('#d9c08c'));
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(-330, top + 0.06, 275);
    root.add(shore);
    for (let i = 0; i < 140; i++) {
      const a = R() * Math.PI * 2;
      const rr = 62 + R() * 26;
      satTrees.push([-330 + Math.cos(a) * rr * 1.0, 275 + Math.sin(a) * rr * 0.8, 2 + R() * 2.4, top, R() < 0.75]);
    }
  }
  // farm (south): crop fields, red barn and silo
  {
    const top = sat(30, 330, 210, 100, -9);
    const soilM = mat('#8a5a34');
    const cropM = mat('#7fb03c');
    const wheatM = mat('#e2b84a');
    for (let f = 0; f < 3; f++) {
      const fx = -40 + f * 46;
      block(root, 38, 0.3, 54, soilM, fx, top + 0.15, 330, { r: 0.2, cast: false });
      for (let r = 0; r < 9; r++) block(root, 36, 0.7, 1.8, f === 1 ? wheatM : cropM, fx, top + 0.6, 306 + r * 6, { r: 0.3, cast: false });
    }
    const bg = new THREE.Group();
    bg.position.set(105, top, 320);
    root.add(bg);
    const red = mat('#b33a2e');
    block(bg, 14, 7, 11, red, 0, 3.5, 0, { r: 0.3 });
    gable(bg, 14, 11, 7, 4, red, roof('#6b4a36'), 0.6);
    block(bg, 4.4, 5, 0.3, mat('#f4ead6'), 0, 2.6, 5.6, { r: 0.08 });
    cyl(bg, 3, 3, 15, mat('#d8cfbf'), -10, 7.5, -2, 20);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9aa0a6', { metalness: 0.3 }));
    dome.position.set(-10, 15, -2);
    bg.add(dome);
    for (let i = 0; i < 40; i++) satTrees.push([-65 + R() * 190, 289 + R() * 5 + (R() < 0.5 ? 0 : 76), 1.8 + R() * 1.6, top, R() < 0.3]);
  }

  // ---------------------------------------------------------------- trees + bushes (instanced, main tile + islands)
  const treeSpots = [];
  const blocked = (x, z) => {
    if (Math.abs(x) > T.half - 8 || Math.abs(z) > T.half - 8) return true;
    const cr = T.radius + 8;
    const ax = Math.abs(x) - (T.half - cr);
    const az = Math.abs(z) - (T.half - cr);
    if (ax > 0 && az > 0 && Math.hypot(ax, az) > cr - 8) return true;
    for (const r of map.roads) if (rectDist(x, z, r) < 5) return true;
    for (const c of map.customers) if (rectDist(x, z, c) < 7) return true;
    if (rectDist(x, z, { x: gen.x, z: gen.z, w: gen.w + 18, d: gen.d + 18 }) < 1) return true;
    if (rectDist(x, z, { x: dep.x + 6, z: dep.z, w: dep.w + 24, d: dep.d + 18 }) < 1) return true;
    if (x > -100 && x < -20 && Math.abs(z) < 26) return true; // keep the generator→town corridor open
    if (x > -32 && x < 100 && z > -62 && z < 64) return R() > 0.07; // town core mostly open
    return false;
  };
  for (let i = 0; i < 1500; i++) {
    const x = (R() * 2 - 1) * T.half;
    const z = (R() * 2 - 1) * T.half;
    // denser toward the tile rim
    const edge = Math.max(Math.abs(x), Math.abs(z)) / T.half;
    if (R() > 0.25 + edge * 0.9) continue;
    if (blocked(x, z)) continue;
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const tx = x + (R() - 0.5) * 8;
      const tz = z + (R() - 0.5) * 8;
      if (!blocked(tx, tz)) treeSpots.push([tx, tz, 1.8 + R() * 1.8, 0, R() < 0.3]);
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
    pines.forEach(([x, z, s, y0]) => {
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
    for (const im of [canopy, trunk, pine]) {
      im.castShadow = true;
      im.receiveShadow = true;
      root.add(im);
    }
  }

  // ---------------------------------------------------------------- instanced windows (frame + glass) and bulbs
  const frameMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat(PAL.cream, { roughness: 0.7 }), winXf.length);
  const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), winXf.length);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbXf.length);
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const off = new THREE.Vector3();
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

  groups.neighbour.target = 1;
  groups.depot.target = 1;
  groups.genyard.target = 1;
  turbines.forEach((t) => (groups[t.gid].target = 1));

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
      for (const p of g.pools) p.material.opacity = p.userData.maxOpacity * g.level * nk * nk;
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
      if (!reduceMotion) t.hub.rotation.z += dt * 0.9;
      groups[t.gid].level = Math.sin(time * 2.2 + t.phase * 10) > 0.6 ? 1 : 0.05;
    }
    winMesh.instanceColor.needsUpdate = true;
    bulbMesh.instanceColor.needsUpdate = true;
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
    generator: { beacon, beaconMat, fan, stackTop: chimTop[0], stackTop2: chimTop[1] },
    coolingTowers,
  };
}
