// Network visuals: poles, transformers, overhead conductors, service drops and the luminous
// ground "flow ribbons" with travelling pulses (GDD §15 power visualisation; video reference).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTexture, hazardTexture } from './textures.js';
import { sourceDef } from '../sim/grid.js';
import { rectDist } from '../sim/grid.js';

const H = { HV: 19, MV: 9.8, LV: 7.6, port: 4.4 };
// Energised network = electric sunflower yellow (matches the hazard-sign accent of the art refs).
export const COL = {
  cyan: new THREE.Color(1.25, 0.86, 0.12), // energised 400 V
  mv: new THREE.Color(1.15, 0.92, 0.38), // energised 11 kV (gold, drawn double)
  lv: new THREE.Color(1.25, 0.86, 0.12),
  tierMV: new THREE.Color(1.3, 0.42, 0.1),
  tierHV: new THREE.Color(0.85, 0.3, 1.3),
  dead: new THREE.Color(0.11, 0.09, 0.075),
  amber: new THREE.Color(1.3, 0.5, 0.06),
  red: new THREE.Color(1.4, 0.1, 0.08),
  green: new THREE.Color(0.3, 1.0, 0.25),
  blue: new THREE.Color(0.45, 0.85, 1.8),
  ghostOk: new THREE.Color(0.3, 1.2, 0.35),
  ghostBad: new THREE.Color(1.4, 0.15, 0.12),
};

const ribbonVS = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const ribbonFS = /* glsl */ `
  uniform vec3 uColor; uniform float uEnergy; uniform float uTime; uniform float uDir; uniform float uLen;
  uniform float uDouble; uniform float uDash; uniform float uSpeed; uniform float uOpacity; uniform float uPulse;
  varying vec2 vUv;
  void main(){
    float v = vUv.y * 2.0 - 1.0;
    float core = uDouble > 0.5 ? exp(-pow((abs(v) - 0.38) / 0.16, 2.0)) : exp(-pow(v / 0.24, 2.0));
    float halo = exp(-pow(v / 0.75, 2.0)) * 0.22;
    float s = vUv.x * uLen;
    float sd = uDir > 0.0 ? s : uLen - s;
    float p = fract((sd - uTime * uSpeed) / 16.0);
    float pulse = pow(smoothstep(0.7, 1.0, p), 2.0) * uPulse;
    float dash = uDash > 0.5 ? step(0.45, fract(s / 3.2)) : 1.0;
    float i = (core * (1.0 + 2.2 * pulse * uEnergy) + halo * uEnergy) * dash;
    vec3 col = uColor * (0.55 + 0.45 * uEnergy) * (1.0 + 1.2 * pulse * uEnergy);
    gl_FragColor = vec4(col, clamp(i, 0.0, 1.0) * uOpacity);
  }`;

function ribbonMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: ribbonVS,
    fragmentShader: ribbonFS,
    uniforms: {
      uColor: { value: COL.dead.clone() },
      uEnergy: { value: 0 },
      uTime: { value: 0 },
      uDir: { value: 1 },
      uLen: { value: 10 },
      uDouble: { value: 0 },
      uDash: { value: 0 },
      uSpeed: { value: 14 },
      uOpacity: { value: 1 },
      uPulse: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

function ribbonGeometry(a, b, width, y = 0.22) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  const nx = (-dz / L) * (width / 2);
  const nz = (dx / L) * (width / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a.x - nx, y, a.z - nz, a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, b.x + nx, y, b.z + nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

function catenary(a, b, sag, segs = 12) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * sag, a.z + (b.z - a.z) * f));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function createNetworkView(scene, map) {
  const root = new THREE.Group();
  scene.add(root);
  const ghostRoot = new THREE.Group();
  scene.add(ghostRoot);

  // toy-diorama props (reso/graphic image 48–51): wooden poles, ceramic insulators, grey cans
  const woodMat = new THREE.MeshStandardMaterial({ color: '#7a5335', roughness: 0.85 });
  const armMat = new THREE.MeshStandardMaterial({ color: '#65432a', roughness: 0.8 });
  const insMat = new THREE.MeshStandardMaterial({ color: '#f2ebdb', roughness: 0.35 });
  const canMat = new THREE.MeshStandardMaterial({ color: '#a9b0b5', roughness: 0.45, metalness: 0.35 });
  const lidMat = new THREE.MeshStandardMaterial({ color: '#8e959a', roughness: 0.4, metalness: 0.4 });
  const hazMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), transparent: true, roughness: 0.6 });
  const poleGeo = { MV: new THREE.CylinderGeometry(0.24, 0.32, H.MV, 10), LV: new THREE.CylinderGeometry(0.21, 0.28, H.LV, 10) };
  const armGeo = { MV: new RoundedBoxGeometry(3.8, 0.32, 0.32, 2, 0.08), LV: new RoundedBoxGeometry(1.8, 0.28, 0.28, 2, 0.07) };
  const insGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.5, 10);
  const canGeo = new THREE.CylinderGeometry(0.95, 0.95, 2.1, 20);
  const lidGeo = new THREE.CylinderGeometry(1.02, 1.02, 0.22, 20);
  const finGeo = new RoundedBoxGeometry(0.14, 1.5, 2.1, 2, 0.05);
  const hazGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const ringGeo = new THREE.TorusGeometry(1.15, 0.16, 8, 28);
  const padGeo = new RoundedBoxGeometry(2.8, 2.3, 2.2, 2, 0.25);
  for (const g of [...Object.values(poleGeo), ...Object.values(armGeo), insGeo, canGeo, lidGeo, finGeo, hazGeo, ringGeo, padGeo]) g.userData.shared = true;
  const dotTex = glowTexture();
  const dotGeo = new THREE.PlaneGeometry(1, 1);
  dotGeo.userData.shared = true;

  let views = { nodes: {}, edges: {} };
  let topoKey = '';

  function disposeTree(o) {
    o.traverse((c) => {
      if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose?.();
      if (c.material && c.material.userData?.own) c.material.dispose?.();
    });
  }

  const portOf = (state, id) => sourceDef(state, id)?.port || state.nodes[id];
  function attachPoint(state, nodeId, tier) {
    const n = state.nodes[nodeId];
    if (n.kind === 'gen') {
      const p = portOf(state, nodeId);
      return new THREE.Vector3(p.x, tier === 'HV' ? 12 : H.port, p.z);
    }
    if (n.kind === 'xfmr' && n.ratio === 'HV/MV') return new THREE.Vector3(n.x, tier === 'HV' ? 11 : 6.5, n.z);
    if (n.kind === 'xfmr' && !n.onPole) return new THREE.Vector3(n.x, 2.2, n.z);
    return new THREE.Vector3(n.x, tier === 'HV' ? H.HV - 1.4 : tier === 'MV' ? H.MV : H.LV - 0.2, n.z);
  }
  const groundPoint = (state, nodeId) => {
    const n = state.nodes[nodeId];
    return n.kind === 'gen' ? portOf(state, nodeId) : n;
  };
  // lattice transmission tower (reso/graphic image 84/86) and substation yard (image 85/87)
  const latMat = new THREE.MeshStandardMaterial({ color: '#6b7278', roughness: 0.55, metalness: 0.35 });
  const legGeo = new THREE.CylinderGeometry(0.14, 0.26, H.HV, 6);
  const braceGeo = new RoundedBoxGeometry(2.8, 0.18, 0.18, 1, 0.04);
  const hvArmGeo = new RoundedBoxGeometry(9.6, 0.36, 0.36, 2, 0.08);
  const strGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8);
  const subPadGeo = new RoundedBoxGeometry(18, 0.3, 14, 2, 0.15);
  const subTankGeo = new RoundedBoxGeometry(3.6, 3.4, 2.8, 2, 0.35);
  for (const g of [legGeo, braceGeo, hvArmGeo, strGeo, subPadGeo, subTankGeo]) g.userData.shared = true;
  const padMat = new THREE.MeshStandardMaterial({ color: '#b8b2a6', roughness: 1 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#c9ccce', roughness: 0.5, metalness: 0.4 });
  function hvTower(g) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(legGeo, latMat);
      leg.position.set(sx * 0.95, H.HV / 2, sz * 0.95);
      leg.rotation.set(sz * 0.06, 0, -sx * 0.06);
      leg.castShadow = true;
      g.add(leg);
    }
    for (const y of [H.HV * 0.3, H.HV * 0.55, H.HV * 0.78]) {
      const b = new THREE.Mesh(braceGeo, latMat);
      b.position.y = y;
      b.scale.x = 1 - y / H.HV / 2;
      g.add(b);
      const b2 = b.clone();
      b2.rotation.y = Math.PI / 2;
      g.add(b2);
    }
    const arm = new THREE.Mesh(hvArmGeo, latMat);
    arm.position.y = H.HV - 0.5;
    arm.castShadow = true;
    g.add(arm);
    for (const ox of [-4, 0, 4]) {
      const ins = new THREE.Mesh(strGeo, insMat);
      ins.position.set(ox, H.HV - 1.2, 0);
      g.add(ins);
    }
  }
  function substationYard(g) {
    const pad = new THREE.Mesh(subPadGeo, padMat);
    pad.position.y = 0.15;
    pad.receiveShadow = true;
    g.add(pad);
    for (const sx of [-3.2, 3.2]) {
      const t = new THREE.Mesh(subTankGeo, canMat);
      t.position.set(sx, 2, 1.5);
      t.castShadow = true;
      g.add(t);
      for (const ox of [-1, 0, 1]) {
        const b = new THREE.Mesh(insGeo, insMat);
        b.position.set(sx + ox, 4.0, 1.5);
        g.add(b);
      }
      const hz = new THREE.Mesh(hazGeo, hazMat);
      hz.position.set(sx, 2.2, 2.92);
      g.add(hz);
    }
    for (const sx of [-5, 5]) {
      for (const sz of [-4, 4]) {
        const leg = new THREE.Mesh(legGeo, latMat);
        leg.scale.y = 0.6;
        leg.position.set(sx, H.HV * 0.3, sz - 2);
        g.add(leg);
      }
    }
    const gantry = new THREE.Mesh(hvArmGeo, latMat);
    gantry.position.set(0, 11, -2);
    g.add(gantry);
    for (const [fx, fz, len, rot] of [[0, -7, 18, 0], [0, 7, 18, 0], [-9, 0, 14, 1], [9, 0, 14, 1]]) {
      const f = new THREE.Mesh(new RoundedBoxGeometry(len, 1.6, 0.12, 1, 0.04), fenceMat);
      f.position.set(fx, 0.95, fz);
      if (rot) f.rotation.y = Math.PI / 2;
      g.add(f);
    }
  }


  // Static batching: a pole/tower/transformer's opaque parts are baked into ≤ 2
  // vertex-coloured meshes (matte + metal), cached per node shape, so a network of
  // hundreds of poles costs a few draw calls each instead of 6–20.
  const vcMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const vcMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 });
  const bakeCache = new Map();
  const _m = new THREE.Matrix4();
  function bake(g, sig) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const parts = [];
    g.traverse((o) => {
      if (o.isMesh && o.material?.isMeshStandardMaterial && !o.material.transparent && !o.material.userData?.own && !o.material.vertexColors) parts.push(o);
    });
    if (parts.length < 2) return;
    let baked = bakeCache.get(sig);
    if (!baked) {
      const buckets = { matte: [], metal: [] };
      const flags = { matte: { cast: false, recv: false }, metal: { cast: false, recv: false } };
      for (const o of parts) {
        const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        geo.clearGroups();
        geo.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
        const n = geo.attributes.position.count;
        const col = new Float32Array(n * 3);
        const c = o.material.color;
        for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const b = o.material.metalness > 0.2 ? 'metal' : 'matte';
        buckets[b].push(geo);
        flags[b].cast ||= o.castShadow;
        flags[b].recv ||= o.receiveShadow;
      }
      baked = [];
      for (const b of ['matte', 'metal']) {
        if (!buckets[b].length) continue;
        const geo = mergeGeometries(buckets[b], false);
        buckets[b].forEach((x) => x.dispose());
        geo.userData.shared = true;
        baked.push({ geo, mat: b === 'metal' ? vcMetal : vcMatte, ...flags[b] });
      }
      bakeCache.set(sig, baked);
    }
    for (const o of parts) o.parent.remove(o);
    for (const b of baked) {
      const m = new THREE.Mesh(b.geo, b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = b.recv;
      g.add(m);
    }
  }

  function makeNode(state, n) {
    const g = new THREE.Group();
    g.position.set(n.x, 0, n.z);
    const v = { group: g, kind: n.kind, ring: null, ringMat: null, dot: null, dotMat: null };
    if (n.kind === 'pole' && n.tier === 'HV') hvTower(g);
    else if (n.kind === 'xfmr' && n.ratio === 'HV/MV') substationYard(g);
    else if (n.kind === 'pole' || (n.kind === 'xfmr' && n.onPole)) {
      const tier = n.kind === 'xfmr' ? 'MV' : n.tier;
      const hgt = H[tier];
      const p = new THREE.Mesh(poleGeo[tier], woodMat);
      p.position.y = hgt / 2;
      p.castShadow = true;
      g.add(p);
      const arm = new THREE.Mesh(armGeo[tier], armMat);
      arm.position.y = hgt - 0.35;
      g.add(arm);
      const nIns = tier === 'MV' ? 3 : 1;
      for (let i = 0; i < nIns; i++) {
        const ins = new THREE.Mesh(insGeo, insMat);
        ins.position.set(nIns === 1 ? 0 : (i - 1) * 1.3, hgt - 0.05, 0);
        g.add(ins);
      }
    }
    if (n.kind === 'xfmr') {
      const sub = n.ratio === 'HV/MV';
      const y = n.onPole ? H.MV - 3.4 : 1.1;
      if (sub) {
        /* substation yard built above */
      } else if (n.onPole) {
        const can = new THREE.Mesh(canGeo, canMat);
        can.position.set(1.05, y, 0);
        can.castShadow = true;
        g.add(can);
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(1.05, y + 1.1, 0);
        g.add(lid);
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(finGeo, canMat);
          fin.position.set(1.05, y - 0.1, s * 0.98);
          fin.rotation.y = Math.PI / 2;
          g.add(fin);
        }
        const hz = new THREE.Mesh(hazGeo, hazMat);
        hz.position.set(2.02, y, 0);
        hz.rotation.y = Math.PI / 2;
        g.add(hz);
        // LV crossarm lower on the same pole
        const arm2 = new THREE.Mesh(armGeo.LV, armMat);
        arm2.position.y = H.LV - 0.55;
        g.add(arm2);
      } else {
        const pad = new THREE.Mesh(padGeo, canMat);
        pad.position.y = 1.15;
        pad.castShadow = true;
        g.add(pad);
        const hz = new THREE.Mesh(hazGeo, hazMat);
        hz.position.set(0, 1.3, 1.11);
        g.add(hz);
      }
      v.ringMat = new THREE.MeshBasicMaterial({ color: COL.cyan.clone() });
      v.ringMat.userData.own = true;
      v.ring = new THREE.Mesh(ringGeo, v.ringMat);
      v.ring.rotation.x = Math.PI / 2;
      v.ring.position.set(sub ? 0 : n.onPole ? 1.05 : 0, sub ? 6 : n.onPole ? y + 1.35 : 2.45, 0);
      if (sub) v.ring.scale.setScalar(3);
      g.add(v.ring);
    }
    if (n.kind !== 'gen') bake(g, n.kind + '|' + (n.tier || '') + '|' + (n.ratio || '') + '|' + (n.onPole ? 'p' : ''));
    // glowing node dot on the ground (the reference's bright junctions)
    v.dotMat = new THREE.MeshBasicMaterial({ map: dotTex, color: COL.dead.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    v.dotMat.userData.own = true;
    v.dot = new THREE.Mesh(dotGeo, v.dotMat);
    v.dot.rotation.x = -Math.PI / 2;
    v.dot.renderOrder = 3;
    const s = n.kind === 'xfmr' ? 6.5 : n.kind === 'gen' ? 7 : 3.8;
    v.dot.scale.set(s, s, 1);
    const gp = n.kind === 'gen' ? portOf(state, n.id) : null;
    v.dot.position.set(gp ? gp.x - n.x : 0, 0.3, gp ? gp.z - n.z : 0);
    g.add(v.dot);
    root.add(g);
    return v;
  }

  function makeEdge(state, e) {
    const g = new THREE.Group();
    const v = { group: g, ribbon: null, mat: null, wires: [], wireMat: null, energy: 0, startAt: 0, len: e.length };
    let a;
    let b;
    let ga;
    let gb;
    if (e.kind === 'line') {
      a = attachPoint(state, e.a, e.tier);
      b = attachPoint(state, e.b, e.tier);
      ga = groundPoint(state, e.a);
      gb = groundPoint(state, e.b);
    } else {
      const n = state.nodes[e.a];
      const c = map.customers.find((x) => x.id === e.b);
      // attach to the nearest point of the building footprint, just under the roof
      const px = Math.max(c.x - c.w / 2, Math.min(n.x, c.x + c.w / 2));
      const pz = Math.max(c.z - c.d / 2, Math.min(n.z, c.z + c.d / 2));
      const hb = c.type === 'market' ? 4.6 : c.type === 'home' ? 5 : 6.5;
      a = new THREE.Vector3(n.x, H.LV - 0.6, n.z);
      b = new THREE.Vector3(px, hb, pz);
      ga = n;
      gb = { x: px + (rectDist(px, pz, c) < 0.01 ? 0 : 0), z: pz };
    }
    v.wireMat = new THREE.MeshStandardMaterial({ color: '#2a2420', metalness: 0.2, roughness: 0.55, emissive: new THREE.Color('#ffc22e'), emissiveIntensity: 0 });
    v.wireMat.userData.own = true;
    const dirX = b.x - a.x;
    const dirZ = b.z - a.z;
    const L = Math.hypot(dirX, dirZ) || 1;
    const px = -dirZ / L;
    const pz = dirX / L;
    const offsets = e.kind === 'line' && e.tier === 'HV' ? [-4, 0, 4] : e.kind === 'line' && e.tier === 'MV' ? [-1.3, 0, 1.3] : [0];
    const r = e.kind === 'drop' ? 0.1 : e.tier === 'HV' ? 0.16 : e.tier === 'MV' ? 0.13 : 0.17;
    // all conductors of a span share one material → one merged mesh per span
    const tubes = offsets.map((o) => new THREE.TubeGeometry(catenary(new THREE.Vector3(a.x + px * o, a.y, a.z + pz * o), new THREE.Vector3(b.x + px * o, b.y, b.z + pz * o), Math.min(e.tier === 'HV' ? 4 : 1.6, L * 0.035)), 16, r, 6, false));
    const wireGeo = tubes.length > 1 ? mergeGeometries(tubes, false) : tubes[0];
    if (tubes.length > 1) tubes.forEach((t) => t.dispose());
    const tube = new THREE.Mesh(wireGeo, v.wireMat);
    tube.castShadow = true;
    g.add(tube);
    v.wires.push(tube);
    const width = e.kind === 'drop' ? 1.0 : e.tier === 'HV' ? 3.6 : e.tier === 'MV' ? 2.6 : 1.8;
    v.mat = ribbonMaterial();
    v.mat.userData.own = true;
    v.mat.uniforms.uLen.value = Math.hypot(gb.x - ga.x, gb.z - ga.z);
    v.mat.uniforms.uDouble.value = e.kind === 'line' && (e.tier === 'MV' || e.tier === 'HV') ? 1 : 0;
    v.ribbon = new THREE.Mesh(ribbonGeometry(ga, gb, width, e.kind === 'drop' ? 0.4 : 0.38), v.mat);
    v.ribbon.renderOrder = 2;
    g.add(v.ribbon);
    root.add(g);
    return v;
  }

  function keyOf(state) {
    let k = '';
    for (const id in state.nodes) {
      const n = state.nodes[id];
      k += id + n.kind + (n.tier || '') + (n.onPole ? 'p' : '') + ';';
    }
    for (const id in state.edges) k += id + ',';
    return k;
  }

  /** Distances from the generator along energised edges (for the power-on wave). */
  function distances(state) {
    const adj = {};
    for (const id in state.edges) {
      const e = state.edges[id];
      if (!e.energized) continue;
      const b = e.kind === 'drop' ? 'c:' + e.b : e.b;
      (adj[e.a] ||= []).push([b, e.length, id]);
      (adj[b] ||= []).push([e.a, e.length, id]);
    }
    const d = { gen: 0 };
    const edgeD = {};
    const q = ['gen'];
    while (q.length) {
      q.sort((x, y) => d[x] - d[y]);
      const u = q.shift();
      for (const [v, w, eid] of adj[u] || []) {
        if (edgeD[eid] == null) edgeD[eid] = d[u];
        if (d[v] == null || d[u] + w < d[v]) {
          d[v] = d[u] + w;
          q.push(v);
        }
      }
    }
    return { node: d, edge: edgeD };
  }

  function sync(state) {
    const k = keyOf(state);
    if (k === topoKey) return false;
    topoKey = k;
    const old = views;
    views = { nodes: {}, edges: {} };
    for (const id in state.nodes) {
      const prev = old.nodes[id];
      const n = state.nodes[id];
      if (prev && prev.kind === n.kind && prev.sig === (n.tier || '') + (n.onPole ? 'p' : '')) {
        views.nodes[id] = prev;
        delete old.nodes[id];
      } else {
        views.nodes[id] = makeNode(state, n);
        views.nodes[id].sig = (n.tier || '') + (n.onPole ? 'p' : '');
        views.nodes[id].born = performance.now();
      }
    }
    for (const id in state.edges) {
      if (old.edges[id]) {
        views.edges[id] = old.edges[id];
        delete old.edges[id];
      } else {
        views.edges[id] = makeEdge(state, state.edges[id]);
        views.edges[id].born = performance.now();
      }
    }
    for (const id in old.nodes) {
      root.remove(old.nodes[id].group);
      disposeTree(old.nodes[id].group);
    }
    for (const id in old.edges) {
      root.remove(old.edges[id].group);
      disposeTree(old.edges[id].group);
    }
    return true;
  }

  const tmp = new THREE.Color();
  const loadColor = (r) => (r < 0.6 ? tmp.copy(COL.green) : r < 0.85 ? tmp.copy(COL.green).lerp(COL.amber, (r - 0.6) / 0.25) : r < 1 ? tmp.copy(COL.amber) : tmp.copy(COL.red));
  const condColor = (c) => (c > 70 ? tmp.copy(COL.green) : c > 40 ? tmp.copy(COL.amber) : tmp.copy(COL.red));

  let lastEnergized = {};
  /**
   * Per-frame update.
   * opts: { overlay, time, dt, reduceMotion, cb (colour-blind patterns), selected, bal }
   */
  function update(state, opts) {
    const { overlay, time, dt, reduceMotion, cb } = opts;
    const now = performance.now() / 1000;
    let dist = null;
    for (const id in views.edges) {
      const e = state.edges[id];
      const v = views.edges[id];
      if (!e) continue;
      // power-on wave: newly energised edges light up in order of distance from the generator
      if (e.energized && !lastEnergized[id]) {
        dist ||= distances(state);
        v.startAt = now + (reduceMotion ? 0 : Math.min(2.5, (dist.edge[id] || 0) / 90));
      }
      lastEnergized[id] = e.energized;
      const target = e.energized && now >= v.startAt ? 1 : 0;
      v.energy += (target - v.energy) * Math.min(1, dt * (target ? 4 : 6));
      const u = v.mat.uniforms;
      u.uTime.value = reduceMotion ? 0 : time;
      u.uDir.value = e.flowDir || 1;
      u.uEnergy.value = v.energy;
      u.uPulse.value = reduceMotion ? 0 : 1;
      const rating = e.kind === 'drop' ? 1e9 : e.ratingKW || (e.tier === 'MV' ? opts.bal.network.mvRatingKW : opts.bal.network.lvRatingKW);
      const ratio = e.loadKW / rating;
      let c;
      let dash = (!e.energized && v.energy < 0.05) || !!e.open;
      if (overlay === 'tier') c = e.kind !== 'line' ? COL.lv : e.tier === 'HV' ? COL.tierHV : e.tier === 'MV' ? COL.tierMV : COL.lv;
      else if (overlay === 'capacity') c = e.kind === 'drop' ? COL.lv : loadColor(ratio);
      else if (overlay === 'condition') c = COL.dead;
      else c = e.kind === 'line' && (e.tier === 'MV' || e.tier === 'HV') ? COL.mv : COL.cyan;
      if (!e.energized && overlay !== 'tier') c = tmp.copy(COL.dead);
      u.uDash.value = dash || (cb && overlay === 'capacity' && ratio >= 0.85) ? 1 : 0;
      u.uSpeed.value = e.kind === 'drop' ? 6 : 14;
      const nk = THREE.MathUtils.clamp(((opts.night ?? 1) - 0.3) / 0.7, 0, 1);
      u.uColor.value.copy(c).multiplyScalar(e.energized && overlay === 'flow' ? 0.55 + 0.45 * nk : 1);
      u.uOpacity.value = overlay === 'condition' ? 0.35 : !e.energized ? 0.7 : overlay === 'flow' ? 0.4 + 0.25 * nk : 0.95;
      v.wireMat.emissiveIntensity = v.energy * (overlay === 'flow' ? 0.55 + 0.75 * nk : 0.4);
      // grow-in animation for new builds
      const age = (performance.now() - (v.born || 0)) / 1000;
      if (age < 0.6 && !reduceMotion) v.group.scale.setScalar(1);
    }
    for (const id in views.nodes) {
      const n = state.nodes[id];
      const v = views.nodes[id];
      if (!n) continue;
      const age = (performance.now() - v.born) / 1000;
      if (n.kind !== 'gen') {
        const s = reduceMotion ? 1 : Math.min(1, 0.2 + age * 2.6);
        v.group.scale.set(1, s, 1);
      }
      let c;
      const tier = n.kind === 'pole' ? n.tier : n.kind === 'gen' ? n.tier || 'MV' : n.ratio === 'HV/MV' ? 'HV' : 'LV';
      if (overlay === 'condition' && (n.kind === 'xfmr' || n.kind === 'gen')) c = condColor(n.kind === 'gen' ? state.gens[n.id]?.condition ?? 100 : n.condition);
      else if (overlay === 'tier') c = tier === 'HV' ? COL.tierHV : tier === 'MV' ? COL.tierMV : COL.lv;
      else if (overlay === 'capacity' && n.kind === 'xfmr') c = loadColor(n.loadPct / 100);
      else c = n.energized ? (tier === 'MV' || tier === 'HV' ? COL.mv : COL.cyan) : COL.dead;
      const nkd = THREE.MathUtils.clamp(((opts.night ?? 1) - 0.3) / 0.7, 0, 1);
      v.dotMat.color.copy(c).multiplyScalar(n.energized ? 0.55 + 1.05 * nkd : 1);
      v.dotMat.opacity = n.energized || overlay !== 'flow' ? 1 : 0.0;
      if (v.ringMat) {
        let rc;
        let blink = false;
        if (n.state === 'fault') {
          rc = COL.red;
          blink = true;
        } else if (n.state === 'trip') {
          rc = COL.red;
        } else if (n.state === 'maint') rc = COL.blue;
        else if (n.overheat || n.overMin > 0) {
          rc = COL.amber;
          blink = true;
        } else if (n.loadPct >= 85) rc = COL.amber;
        else if (n.energized) rc = COL.green;
        else rc = COL.dead;
        v.ringMat.color.copy(rc);
        if (blink && !reduceMotion && Math.sin(time * 8) < 0) v.ringMat.color.multiplyScalar(0.25);
      }
    }
  }

  // ---------------------------------------------------------------- ghost preview
  const ghostPoleMat = new THREE.MeshBasicMaterial({ color: COL.ghostOk, transparent: true, opacity: 0.6, depthWrite: false });
  const ghostRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial());
  ghostRibbon.material.uniforms.uDash.value = 1;
  ghostRibbon.material.uniforms.uEnergy.value = 1;
  ghostRibbon.renderOrder = 3;
  ghostRoot.add(ghostRibbon);
  const ghostPoles = [];
  const ghostPoleGeo = new THREE.CylinderGeometry(0.35, 0.45, 8, 8);
  ghostPoleGeo.userData.shared = true;
  function showGhost(points, ok, time, tier = 'LV') {
    ghostRoot.visible = !!points;
    if (!points) return;
    const a = points[0];
    const b = points[points.length - 1];
    ghostRibbon.geometry.dispose();
    ghostRibbon.geometry = ribbonGeometry(a, b, tier === 'HV' ? 4.0 : tier === 'MV' ? 3.0 : 2.2, 0.45);
    const u = ghostRibbon.material.uniforms;
    u.uColor.value.copy(ok ? COL.ghostOk : COL.ghostBad);
    u.uLen.value = Math.hypot(b.x - a.x, b.z - a.z);
    u.uTime.value = time;
    u.uDouble.value = tier === 'MV' || tier === 'HV' ? 1 : 0;
    ghostPoleMat.color.copy(ok ? COL.ghostOk : COL.ghostBad);
    const need = Math.max(0, points.length - 1);
    while (ghostPoles.length < need) {
      const m = new THREE.Mesh(ghostPoleGeo, ghostPoleMat);
      ghostRoot.add(m);
      ghostPoles.push(m);
    }
    ghostPoles.forEach((m, i) => {
      const p = points[i + 1];
      m.visible = i < need && !!p;
      if (p) m.position.set(p.x, 4, p.z);
    });
  }

  function dispose() {
    for (const r of [root, ghostRoot]) {
      scene.remove(r);
      disposeTree(r);
    }
  }
  return { root, sync, update, showGhost, views: () => views, attachPoint, dispose };
}
