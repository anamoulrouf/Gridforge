// Static world: terrain, roads, trees, customer buildings with powered windows, generator yard,
// depot, street lights and background set-dressing (GDD §15 art direction; video reference).
import * as THREE from 'three';
import { rng } from '../sim/rng.js';
import { rectDist } from '../sim/grid.js';
import { glowTexture, poolTexture, groundTexture, signTexture, crossTexture } from './textures.js';

const WARM = new THREE.Color(2.9, 1.55, 0.62); // HDR warm window light (blooms)
const WARM_SOFT = new THREE.Color(1.6, 0.95, 0.45);
const DARK_WIN = new THREE.Color(0.018, 0.028, 0.045);

export function createWorld(scene, map) {
  const root = new THREE.Group();
  scene.add(root);
  const R = rng(2024);

  // ---------------------------------------------------------------- ground
  const groundMat = new THREE.MeshStandardMaterial({ color: '#2a3c4e', map: groundTexture(), roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // service-area boundary (subtle dashed cyan)
  {
    const b = map.bounds;
    const pts = [new THREE.Vector3(b.minX, 0.08, b.minZ), new THREE.Vector3(b.maxX, 0.08, b.minZ), new THREE.Vector3(b.maxX, 0.08, b.maxZ), new THREE.Vector3(b.minX, 0.08, b.maxZ), new THREE.Vector3(b.minX, 0.08, b.minZ)];
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#3fd8ff', dashSize: 4, gapSize: 5, transparent: true, opacity: 0.22 }));
    l.computeLineDistances();
    root.add(l);
  }

  // ---------------------------------------------------------------- roads
  const roadMat = new THREE.MeshStandardMaterial({ color: '#141f2b', roughness: 0.95 });
  const curbMat = new THREE.MeshStandardMaterial({ color: '#2a3a4b', roughness: 1 });
  const markMat = new THREE.MeshBasicMaterial({ color: '#56677a' });
  const marks = [];
  for (const r of map.roads) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(r.w + 1.6, 0.1, r.d + 1.6), curbMat);
    curb.position.set(r.x, 0.05, r.z);
    curb.receiveShadow = true;
    root.add(curb);
    const road = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.14, r.d), roadMat);
    road.position.set(r.x, 0.07, r.z);
    road.receiveShadow = true;
    root.add(road);
    if (r.id === 'main' || r.id === 'cross') {
      const along = r.w > r.d;
      const len = along ? r.w : r.d;
      for (let s = -len / 2 + 3; s < len / 2 - 3; s += 7) {
        const x = along ? r.x + s : r.x;
        const z = along ? r.z : r.z + s;
        if (r.id === 'main' && Math.abs(x - 40) < 6) continue;
        if (r.id === 'cross' && Math.abs(z) < 6) continue;
        marks.push({ x, z, along });
      }
    }
  }
  {
    const mg = new THREE.PlaneGeometry(3, 0.25);
    const im = new THREE.InstancedMesh(mg, markMat, marks.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    marks.forEach((k, i) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, k.along ? 0 : Math.PI / 2));
      m4.compose(new THREE.Vector3(k.x, 0.15, k.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4);
    });
    root.add(im);
  }

  // ---------------------------------------------------------------- lights registry (windows / bulbs)
  const lights = []; // { group, mesh:'win'|'bulb', idx, thr, color }
  const winXf = [];
  const bulbXf = [];
  const groups = {}; // id -> { level, target, flicker, pools:[], signs:[] , center, height }
  const ensureGroup = (id, center, height) => (groups[id] ||= { id, level: 0, target: 0, partial: false, pools: [], signs: [], center, height, emissiveMats: [] });

  function addWindow(gid, pos, rotY, w, h, thr) {
    winXf.push({ pos, rotY, w, h });
    lights.push({ g: gid, mesh: 'win', idx: winXf.length - 1, thr, lit: R() < 0.82, color: R() < 0.25 ? WARM_SOFT : WARM });
  }
  function addBulb(gid, pos, size, thr, color = WARM) {
    bulbXf.push({ pos, size });
    lights.push({ g: gid, mesh: 'bulb', idx: bulbXf.length - 1, thr, lit: true, color });
  }
  function addPool(gid, x, z, size, color = '#ffb36b', opacity = 0.55) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.2, z);
    m.userData.maxOpacity = opacity;
    root.add(m);
    groups[gid].pools.push(m);
  }

  // ---------------------------------------------------------------- buildings
  const wallMats = ['#3b4b5d', '#46566a', '#36475a', '#4a5970'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: '#222f3d', roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#5b6b80', roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#141c26', roughness: 0.7 });
  const unitMat = new THREE.MeshStandardMaterial({ color: '#56657a', roughness: 0.6, metalness: 0.3 });

  const box = (w, h, d, mat, x, y, z, parent = root, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  /** Rows of windows on the four facades. */
  function facadeWindows(gid, c, height, floors, perFront, perSide, winW = 1.5, winH = 1.3) {
    const fh = height / floors;
    const order = [];
    for (let f = 0; f < floors; f++) {
      const y = fh * f + fh * 0.55;
      for (let i = 0; i < perFront; i++) {
        const x = c.x - c.w / 2 + (c.w / perFront) * (i + 0.5);
        order.push([new THREE.Vector3(x, y, c.z + c.d / 2 + 0.06), 0]);
        order.push([new THREE.Vector3(x, y, c.z - c.d / 2 - 0.06), Math.PI]);
      }
      for (let i = 0; i < perSide; i++) {
        const z = c.z - c.d / 2 + (c.d / perSide) * (i + 0.5);
        order.push([new THREE.Vector3(c.x + c.w / 2 + 0.06, y, z), Math.PI / 2]);
        order.push([new THREE.Vector3(c.x - c.w / 2 - 0.06, y, z), -Math.PI / 2]);
      }
    }
    // staggered switch-on order
    const n = order.length;
    order.forEach(([p, r], i) => addWindow(gid, p, r, winW, winH, ((i * 7919) % n) / n * 0.85 + 0.05));
  }

  const buildings = {};
  for (const c of map.customers) {
    const g = new THREE.Group();
    root.add(g);
    const wall = wallMats[Math.floor(R() * wallMats.length)];
    let height = 6;
    if (c.type === 'home') {
      height = 5.6 + Math.floor(R() * 3) * 1.1;
      box(c.w, height, c.d, wall, c.x, height / 2, c.z, g);
      box(c.w + 0.4, 0.5, c.d + 0.4, roofMat, c.x, height + 0.25, c.z, g);
      box(1.6, 1, 1.6, unitMat, c.x + c.w * 0.2, height + 1, c.z - c.d * 0.15, g);
      box(1.2, 2.2, 0.1, doorMat, c.x - c.w * 0.25, 1.1, c.z + c.d / 2 + 0.05, g, false);
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      facadeWindows(c.id, c, height, 2, 2, 2, 1.3, 1.1);
      addPool(c.id, c.x, c.z, 20, '#ffb36b', 0.16);
    } else if (c.type === 'school') {
      height = 8.4;
      box(c.w, height, c.d, wallMats[1], c.x, height / 2, c.z, g);
      box(c.w + 0.6, 0.7, c.d + 0.6, roofMat, c.x, height + 0.35, c.z, g);
      box(4, 1.2, 3, unitMat, c.x - 6, height + 1.2, c.z, g);
      box(3, 1.2, 3, unitMat, c.x + 7, height + 1.2, c.z + 1, g);
      box(6, 0.4, 3, trimMat, c.x, 3.6, c.z + c.d / 2 + 1.5, g); // entrance canopy
      box(2.6, 3, 0.1, doorMat, c.x, 1.5, c.z + c.d / 2 + 0.06, g, false);
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      facadeWindows(c.id, c, height, 2, 8, 3);
      addPool(c.id, c.x, c.z + 4, 38, '#ffb36b', 0.2);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTexture('SCHOOL'), transparent: true, color: new THREE.Color(0.08, 0.1, 0.12) }));
      sign.position.set(c.x, 5.4, c.z + c.d / 2 + 0.12);
      g.add(sign);
      groups[c.id].signs.push({ mesh: sign, on: new THREE.Color(1.6, 1.8, 2.2), off: new THREE.Color(0.08, 0.1, 0.12) });
      // flag pole
      box(0.2, 9, 0.2, trimMat, c.x + 11, 4.5, c.z + c.d / 2 + 4, g);
    } else if (c.type === 'clinic') {
      height = 7.6;
      const cm = new THREE.MeshStandardMaterial({ color: '#7b8b9e', roughness: 0.85 });
      box(c.w, height, c.d, cm, c.x, height / 2, c.z, g);
      box(c.w + 0.5, 0.6, c.d + 0.5, roofMat, c.x, height + 0.3, c.z, g);
      box(5, 0.35, 3.2, trimMat, c.x - 3, 3.4, c.z + c.d / 2 + 1.6, g);
      box(2.4, 2.8, 0.1, doorMat, c.x - 3, 1.4, c.z + c.d / 2 + 0.06, g, false);
      box(3, 1.4, 3, unitMat, c.x + 4, height + 1.3, c.z - 2, g);
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      facadeWindows(c.id, c, height, 2, 5, 3);
      addPool(c.id, c.x, c.z + 3, 30, '#ffc58a', 0.22);
      for (const side of [1, -1]) {
        const cross = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: crossTexture(), transparent: true, color: new THREE.Color(0.05, 0.12, 0.08) }));
        cross.position.set(c.x + 4.5, height - 1.6, c.z + (c.d / 2 + 0.12) * side);
        if (side < 0) cross.rotation.y = Math.PI;
        g.add(cross);
        groups[c.id].signs.push({ mesh: cross, on: new THREE.Color(0.4, 2.6, 1.1), off: new THREE.Color(0.05, 0.12, 0.08) });
      }
    } else if (c.type === 'market') {
      height = 6;
      const postMat = trimMat;
      for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) box(0.4, 5, 0.4, postMat, c.x + sx * (c.w / 2 - 0.5), 2.5, c.z + sz * (c.d / 2 - 0.5), g);
      // gable roof
      const roofG = new THREE.BoxGeometry(c.w + 1, 0.3, c.d / 2 + 1.2);
      for (const s of [1, -1]) {
        const rm = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: '#3b2f2a', roughness: 0.9 }));
        rm.position.set(c.x, 5.7, c.z + s * (c.d / 4 + 0.2));
        rm.rotation.x = s * 0.32;
        rm.castShadow = true;
        g.add(rm);
      }
      const awn = ['#8a3b3b', '#2f6d6a', '#9a7b2f', '#3d5a8a'];
      for (let i = 0; i < 4; i++) {
        const sx = c.x - c.w / 2 + 2.8 + i * ((c.w - 5.6) / 3);
        box(3, 1.2, 2, unitMat, sx, 0.6, c.z, g);
        box(3.2, 0.15, 2.4, new THREE.MeshStandardMaterial({ color: awn[i], roughness: 0.8 }), sx, 2.4, c.z, g);
      }
      ensureGroup(c.id, new THREE.Vector3(c.x, height, c.z), height);
      // string lights along both eaves
      for (const s of [1, -1]) {
        for (let i = 0; i <= 14; i++) {
          const f = i / 14;
          const sag = Math.sin(f * Math.PI * 3) ** 2 * 0.5;
          addBulb(c.id, new THREE.Vector3(c.x - c.w / 2 + f * c.w, 4.4 - sag, c.z + s * (c.d / 2 + 0.3)), 0.32, 0.05 + f * 0.8, i % 3 === 0 ? new THREE.Color(2.4, 1.0, 0.5) : WARM);
        }
      }
      addPool(c.id, c.x, c.z, 32, '#ffb36b', 0.24);
    }
    buildings[c.id] = { group: g, height, c };
  }

  // ---------------------------------------------------------------- generator yard
  const gen = map.generator;
  const genG = new THREE.Group();
  root.add(genG);
  box(gen.w + 6, 0.3, gen.d + 6, new THREE.MeshStandardMaterial({ color: '#2b3946', roughness: 1 }), gen.x, 0.15, gen.z, genG);
  const container = box(10, 4.2, 4, new THREE.MeshStandardMaterial({ color: '#46604f', roughness: 0.7, metalness: 0.2 }), gen.x - 1, 2.4, gen.z, genG);
  void container;
  for (let i = 0; i < 6; i++) box(0.12, 2.6, 0.05, new THREE.MeshStandardMaterial({ color: '#22302a' }), gen.x - 5 + i * 1.4, 2.4, gen.z + 2.03, genG, false);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 20), new THREE.MeshStandardMaterial({ color: '#6b7685', roughness: 0.5, metalness: 0.4 }));
  tank.rotation.z = Math.PI / 2;
  tank.position.set(gen.x - 1, 1.5, gen.z - 3.6);
  tank.castShadow = true;
  genG.add(tank);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.6, 12), new THREE.MeshStandardMaterial({ color: '#3a3f46', metalness: 0.6, roughness: 0.4 }));
  stack.position.set(gen.x + 3, 6, gen.z - 0.8);
  stack.castShadow = true;
  genG.add(stack);
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 6), new THREE.MeshStandardMaterial({ color: '#2a332e', metalness: 0.5 }));
  fan.position.set(gen.x - 3.5, 4.62, gen.z);
  genG.add(fan);
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.2) });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), beaconMat);
  beacon.position.set(gen.x + 1.5, 4.85, gen.z + 1.5);
  genG.add(beacon);
  // fence posts
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    for (const [x, z] of [
      [gen.x - gen.w / 2 - 3 + f * (gen.w + 6), gen.z - gen.d / 2 - 3],
      [gen.x - gen.w / 2 - 3, gen.z - gen.d / 2 - 3 + f * (gen.d + 6)],
      [gen.x + gen.w / 2 + 3, gen.z - gen.d / 2 - 3 + f * (gen.d + 6)],
    ])
      box(0.15, 2, 0.15, trimMat, x, 1, z, genG, false);
  }
  ensureGroup('genyard', new THREE.Vector3(gen.x, 4, gen.z), 4);
  addBulb('genyard', new THREE.Vector3(gen.x + 5, 6.4, gen.z + 4.5), 0.45, 0.1, new THREE.Color(2.2, 2.0, 1.6));
  box(0.2, 6.4, 0.2, trimMat, gen.x + 5, 3.2, gen.z + 4.5, genG);
  addPool('genyard', gen.x + 4, gen.z + 4, 20, '#cfe2ff', 0.35);

  // ---------------------------------------------------------------- depot
  const dep = map.depot;
  const depG = new THREE.Group();
  root.add(depG);
  box(dep.w, 6, dep.d, new THREE.MeshStandardMaterial({ color: '#3a4656', roughness: 0.9 }), dep.x, 3, dep.z, depG);
  box(dep.w + 0.6, 0.5, dep.d + 0.6, roofMat, dep.x, 6.25, dep.z, depG);
  for (const dx of [-4.5, 4.5]) box(6, 4.2, 0.1, new THREE.MeshStandardMaterial({ color: '#59687a', roughness: 0.6 }), dep.x + dx, 2.1, dep.z - dep.d / 2 - 0.06, depG, false);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTexture('GRID OPS'), transparent: true, color: new THREE.Color(1.2, 1.6, 2.0) }));
  sign.position.set(dep.x, 5.2, dep.z - dep.d / 2 - 0.12);
  sign.rotation.y = Math.PI;
  depG.add(sign);
  // pole stack + cable drums
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 8, 8), new THREE.MeshStandardMaterial({ color: '#4a3a2c' }));
    p.rotation.z = Math.PI / 2;
    p.position.set(dep.x + 13, 0.25 + Math.floor(i / 3) * 0.42, dep.z - 3 + (i % 3) * 0.45);
    depG.add(p);
  }
  for (let i = 0; i < 2; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 16), new THREE.MeshStandardMaterial({ color: '#6a5034' }));
    d.rotation.x = Math.PI / 2;
    d.position.set(dep.x + 12 + i * 2.6, 1.1, dep.z + 4);
    d.castShadow = true;
    depG.add(d);
  }
  ensureGroup('depot', new THREE.Vector3(dep.x, 6, dep.z), 6);
  facadeWindows('depot', { x: dep.x, z: dep.z, w: dep.w, d: dep.d }, 6, 1, 3, 2, 1.6, 1.0);
  addPool('depot', dep.x, dep.z - 8, 26, '#cfe2ff', 0.4);
  box(0.2, 7, 0.2, trimMat, dep.x - 10, 3.5, dep.z - 10, depG);
  addBulb('depot', new THREE.Vector3(dep.x - 10, 7.1, dep.z - 10), 0.45, 0.1, new THREE.Color(2.2, 2.0, 1.6));

  // ---------------------------------------------------------------- street lights (north / south clusters)
  ensureGroup('street-n', new THREE.Vector3(30, 6, -10), 6);
  ensureGroup('street-s', new THREE.Vector3(30, 6, 10), 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#3f4c5c', metalness: 0.4, roughness: 0.6 });
  const lamps = [];
  for (let x = -30; x <= 100; x += 26) lamps.push([x, -5.6, 'street-n'], [x + 13, 5.6, 'street-s']);
  for (let z = -80; z <= 80; z += 26) if (Math.abs(z) > 8) lamps.push([44.4, z, z < 0 ? 'street-n' : 'street-s']);
  lamps.forEach(([x, z, gid], i) => {
    box(0.18, 6, 0.18, lampMat, x, 3, z, root, false);
    addBulb(gid, new THREE.Vector3(x, 6.1, z), 0.38, (i % 7) / 8 + 0.05, new THREE.Color(2.3, 1.7, 1.0));
    addPool(gid, x, z, 12, '#ffcf8a', 0.26);
  });

  // ---------------------------------------------------------------- instanced windows + bulbs
  const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), winXf.length);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbXf.length);
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    winXf.forEach((w, i) => {
      q.setFromEuler(e.set(0, w.rotY, 0));
      m4.compose(w.pos, q, new THREE.Vector3(w.w, w.h, 1));
      winMesh.setMatrixAt(i, m4);
      winMesh.setColorAt(i, DARK_WIN);
    });
    bulbXf.forEach((b, i) => {
      m4.compose(b.pos, q.identity(), new THREE.Vector3(b.size, b.size, b.size));
      bulbMesh.setMatrixAt(i, m4);
      bulbMesh.setColorAt(i, DARK_WIN);
    });
    root.add(winMesh, bulbMesh);
  }

  // ---------------------------------------------------------------- trees (instanced blobs)
  const treeSpots = [];
  const blocked = (x, z) => {
    for (const r of map.roads) if (rectDist(x, z, r) < 4) return true;
    for (const c of map.customers) if (rectDist(x, z, c) < 6) return true;
    if (rectDist(x, z, { x: gen.x, z: gen.z, w: gen.w + 14, d: gen.d + 14 }) < 1) return true;
    if (rectDist(x, z, { x: dep.x + 6, z: dep.z, w: dep.w + 22, d: dep.d + 16 }) < 1) return true;
    // keep the generator→town corridor and the town core mostly open
    if (x > -100 && x < -20 && Math.abs(z) < 26) return true;
    if (x > -30 && x < 100 && z > -60 && z < 62) return R() > 0.06;
    return false;
  };
  for (let i = 0; i < 1400; i++) {
    // denser ring around the play area; sparse inside
    const ang = R() * Math.PI * 2;
    const rad = i < 300 ? R() * 150 : 130 + Math.pow(R(), 0.7) * 520;
    const cx = Math.cos(ang) * rad + 10;
    const cz = Math.sin(ang) * rad;
    if (blocked(cx, cz)) continue;
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) treeSpots.push([cx + (R() - 0.5) * 7, cz + (R() - 0.5) * 7, 2.2 + R() * 2.4]);
  }
  {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, treeSpots.length * 2);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 5), new THREE.MeshStandardMaterial({ color: '#1d1a17' }), treeSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let k = 0;
    treeSpots.forEach(([x, z, s], i) => {
      const h = s * 1.2;
      m4.compose(new THREE.Vector3(x, h + s * 0.6, z), q, new THREE.Vector3(s, s * 1.15, s));
      im.setMatrixAt(k, m4);
      im.setColorAt(k++, col.setHSL(0.47 + R() * 0.06, 0.32 + R() * 0.12, 0.085 + R() * 0.05));
      m4.compose(new THREE.Vector3(x + s * 0.4, h + s * 1.2, z - s * 0.3), q, new THREE.Vector3(s * 0.7, s * 0.8, s * 0.7));
      im.setMatrixAt(k, m4);
      im.setColorAt(k++, col.setHSL(0.48 + R() * 0.05, 0.3 + R() * 0.12, 0.1 + R() * 0.05));
      m4.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(1, h, 1));
      trunk.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    root.add(im, trunk);
  }

  // ---------------------------------------------------------------- background: turbines, cooling towers, neighbouring town
  const turbines = [];
  const towerMat = new THREE.MeshStandardMaterial({ color: '#c9d3df', roughness: 0.5 });
  [[250, -140], [285, -80], [262, -10], [300, 50], [272, 118]].forEach(([x, z], i) => {
    const t = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, 46, 10), towerMat);
    tower.position.y = 23;
    t.add(tower);
    const nac = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 5), towerMat);
    nac.position.set(0, 46.5, 0.6);
    t.add(nac);
    const hub = new THREE.Group();
    hub.position.set(0, 46.5, 3.4);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 0.3), towerMat);
      blade.position.y = 11;
      const arm = new THREE.Group();
      arm.rotation.z = (b * Math.PI * 2) / 3;
      arm.add(blade);
      hub.add(arm);
    }
    t.add(hub);
    t.position.set(x, 0, z);
    t.rotation.y = -Math.PI / 2 + 0.3;
    root.add(t);
    ensureGroup('turb' + i, new THREE.Vector3(x, 48, z), 48);
    addBulb('turb' + i, new THREE.Vector3(x, 48, z), 0.7, 0.1, new THREE.Color(3, 0.2, 0.15));
    turbines.push({ hub, gid: 'turb' + i, phase: i * 0.37 });
  });
  const coolingTowers = [];
  {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const y = (i / 12) * 44;
      const r = 15 - Math.sin((i / 12) * Math.PI) * 5.5 - (i / 12) * 2;
      pts.push(new THREE.Vector2(r, y));
    }
    const lathe = new THREE.LatheGeometry(pts, 36);
    const ctMat = new THREE.MeshStandardMaterial({ color: '#8d99a8', roughness: 0.9, side: THREE.DoubleSide });
    [[-300, -230], [-262, -262]].forEach(([x, z], i) => {
      const m = new THREE.Mesh(lathe, ctMat);
      m.position.set(x, 0, z);
      root.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15.2, 0.35, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.4, 3.2) }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 1.2, z);
      root.add(ring);
      coolingTowers.push({ x, z, top: 44, r: 10 });
      void i;
    });
  }
  // neighbouring, already-powered town far to the north-east (depth + promise)
  ensureGroup('neighbour', new THREE.Vector3(360, 6, -360), 6);
  for (let i = 0; i < 26; i++) {
    const x = 330 + R() * 120;
    const z = -400 + R() * 110;
    const h = 5 + R() * 10;
    box(8 + R() * 6, h, 8 + R() * 6, wallMats[i % 4], x, h / 2, z, root, false);
    for (let k = 0; k < 4; k++) addBulb('neighbour', new THREE.Vector3(x + (R() - 0.5) * 6, 2 + R() * (h - 3), z + 4.5), 0.6, 0.1, WARM);
  }
  groups.neighbour.target = 1;
  groups.depot.target = 1;
  groups.genyard.target = 1;
  turbines.forEach((t) => (groups[t.gid].target = 1));

  // ---------------------------------------------------------------- per-frame lighting
  const col = new THREE.Color();
  let nightK = 1;
  function update(dt, time, nightFactor, reduceMotion) {
    nightK = nightFactor;
    for (const id in groups) {
      const g = groups[id];
      const speed = g.target > g.level ? 0.55 : 2.2; // light-up is a slow, staggered sweep; blackout is quick
      g.level += Math.sign(g.target - g.level) * Math.min(Math.abs(g.target - g.level), dt * speed);
      for (const p of g.pools) p.material.opacity = p.userData.maxOpacity * g.level * (0.35 + 0.65 * nightK);
      for (const s of g.signs) s.mesh.material.color.copy(col.copy(s.off).lerp(s.on, g.level));
    }
    const flick = Math.floor(time * 9);
    for (const L of lights) {
      const g = groups[L.g];
      let on = L.lit && g.level > L.thr;
      if (on && g.partial && !reduceMotion && ((L.idx * 31 + flick) % 11 === 0)) on = false;
      const target = on ? col.copy(L.color).multiplyScalar(0.3 + 0.7 * nightK) : DARK_WIN;
      (L.mesh === 'win' ? winMesh : bulbMesh).setColorAt(L.idx, target);
    }
    // aviation lights blink
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
    generator: { beacon, beaconMat, fan, stackTop: new THREE.Vector3(gen.x + 3, 8, gen.z - 0.8) },
    coolingTowers,
  };
}
