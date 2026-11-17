// Network visuals: poles, transformers, overhead conductors, service drops and the luminous
// ground "flow ribbons" with travelling pulses (GDD §15 power visualisation; video reference).
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { rectDist } from '../sim/grid.js';

const H = { MV: 9.6, LV: 7.4, port: 4.4 };
export const COL = {
  cyan: new THREE.Color(0.1, 0.62, 1.05),
  mv: new THREE.Color(0.42, 0.36, 1.1),
  lv: new THREE.Color(0.1, 0.62, 1.05),
  dead: new THREE.Color(0.2, 0.27, 0.36),
  amber: new THREE.Color(1.3, 0.62, 0.1),
  red: new THREE.Color(1.4, 0.12, 0.15),
  green: new THREE.Color(0.16, 1.0, 0.42),
  blue: new THREE.Color(0.5, 0.9, 2.8),
  ghostOk: new THREE.Color(0.3, 1.3, 0.55),
  ghostBad: new THREE.Color(1.4, 0.18, 0.18),
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
    float i = (core * (1.0 + 2.6 * pulse * uEnergy) + halo * uEnergy) * dash;
    vec3 col = uColor * (0.22 + 0.78 * uEnergy);
    gl_FragColor = vec4(col * i * uOpacity, 1.0);
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
    blending: THREE.AdditiveBlending,
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

  const woodMat = new THREE.MeshStandardMaterial({ color: '#3b3027', roughness: 0.9 });
  const armMat = new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.6, metalness: 0.4 });
  const insMat = new THREE.MeshStandardMaterial({ color: '#c8d4e0', roughness: 0.3 });
  const canMat = new THREE.MeshStandardMaterial({ color: '#7a8796', roughness: 0.45, metalness: 0.55 });
  const poleGeo = { MV: new THREE.CylinderGeometry(0.16, 0.24, H.MV, 7), LV: new THREE.CylinderGeometry(0.14, 0.2, H.LV, 7) };
  const armGeo = { MV: new THREE.BoxGeometry(3.4, 0.18, 0.18), LV: new THREE.BoxGeometry(1.4, 0.16, 0.16) };
  const insGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 6);
  const canGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.9, 14);
  const finGeo = new THREE.BoxGeometry(0.08, 1.4, 2.0);
  const ringGeo = new THREE.TorusGeometry(1.0, 0.13, 6, 24);
  const dotTex = glowTexture();

  let views = { nodes: {}, edges: {} };
  let topoKey = '';

  function disposeTree(o) {
    o.traverse((c) => {
      if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose?.();
      if (c.material && c.material.userData?.own) c.material.dispose?.();
    });
  }

  function attachPoint(state, nodeId, tier) {
    const n = state.nodes[nodeId];
    if (n.kind === 'gen') return new THREE.Vector3(map.generator.port.x, H.port, map.generator.port.z);
    if (n.kind === 'xfmr' && !n.onPole) return new THREE.Vector3(n.x, 2.2, n.z);
    return new THREE.Vector3(n.x, tier === 'MV' ? H.MV : H.LV - 0.2, n.z);
  }
  const groundPoint = (state, nodeId) => {
    const n = state.nodes[nodeId];
    return n.kind === 'gen' ? map.generator.port : n;
  };

  function makeNode(state, n) {
    const g = new THREE.Group();
    g.position.set(n.x, 0, n.z);
    const v = { group: g, kind: n.kind, ring: null, ringMat: null, dot: null, dotMat: null };
    if (n.kind === 'pole' || (n.kind === 'xfmr' && n.onPole)) {
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
      const y = n.onPole ? H.MV - 3.4 : 1.1;
      if (n.onPole) {
        const can = new THREE.Mesh(canGeo, canMat);
        can.position.set(0.95, y, 0);
        can.castShadow = true;
        g.add(can);
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(finGeo, canMat);
          fin.position.set(0.95 + s * 0.88, y, 0);
          g.add(fin);
        }
        // LV crossarm lower on the same pole
        const arm2 = new THREE.Mesh(armGeo.LV, armMat);
        arm2.position.y = H.LV - 0.55;
        g.add(arm2);
      } else {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.0), canMat);
        pad.position.y = 1.1;
        pad.castShadow = true;
        g.add(pad);
      }
      v.ringMat = new THREE.MeshBasicMaterial({ color: COL.cyan.clone() });
      v.ringMat.userData.own = true;
      v.ring = new THREE.Mesh(ringGeo, v.ringMat);
      v.ring.rotation.x = Math.PI / 2;
      v.ring.position.set(n.onPole ? 0.95 : 0, n.onPole ? y + 1.05 : 2.3, 0);
      g.add(v.ring);
    }
    // glowing node dot on the ground (the reference's bright junctions)
    v.dotMat = new THREE.SpriteMaterial({ map: dotTex, color: COL.dead.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    v.dotMat.userData.own = true;
    v.dot = new THREE.Sprite(v.dotMat);
    const s = n.kind === 'xfmr' ? 9 : n.kind === 'gen' ? 10 : 5.5;
    v.dot.scale.set(s, s, 1);
    v.dot.position.set(n.kind === 'gen' ? map.generator.port.x - n.x : 0, 0.5, n.kind === 'gen' ? map.generator.port.z - n.z : 0);
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
    v.wireMat = new THREE.MeshStandardMaterial({ color: '#2b3846', metalness: 0.6, roughness: 0.45, emissive: new THREE.Color('#1a6c88'), emissiveIntensity: 0 });
    v.wireMat.userData.own = true;
    const dirX = b.x - a.x;
    const dirZ = b.z - a.z;
    const L = Math.hypot(dirX, dirZ) || 1;
    const px = -dirZ / L;
    const pz = dirX / L;
    const offsets = e.kind === 'line' && e.tier === 'MV' ? [-1.3, 0, 1.3] : [0];
    const r = e.kind === 'drop' ? 0.05 : e.tier === 'MV' ? 0.06 : 0.09;
    for (const o of offsets) {
      const curve = catenary(new THREE.Vector3(a.x + px * o, a.y, a.z + pz * o), new THREE.Vector3(b.x + px * o, b.y, b.z + pz * o), Math.min(1.6, L * 0.035));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, r, 4, false), v.wireMat);
      g.add(tube);
      v.wires.push(tube);
    }
    const width = e.kind === 'drop' ? 1.3 : e.tier === 'MV' ? 3.2 : 2.3;
    v.mat = ribbonMaterial();
    v.mat.userData.own = true;
    v.mat.uniforms.uLen.value = Math.hypot(gb.x - ga.x, gb.z - ga.z);
    v.mat.uniforms.uDouble.value = e.kind === 'line' && e.tier === 'MV' ? 1 : 0;
    v.ribbon = new THREE.Mesh(ribbonGeometry(ga, gb, width, e.kind === 'drop' ? 0.24 : 0.22), v.mat);
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
      const rating = e.kind === 'drop' ? 1e9 : e.tier === 'MV' ? opts.bal.network.mvRatingKW : opts.bal.network.lvRatingKW;
      const ratio = e.loadKW / rating;
      let c;
      let dash = !e.energized && v.energy < 0.05;
      if (overlay === 'tier') c = e.tier === 'MV' && e.kind === 'line' ? COL.mv : COL.lv;
      else if (overlay === 'capacity') c = e.kind === 'drop' ? COL.lv : loadColor(ratio);
      else if (overlay === 'condition') c = COL.dead;
      else c = e.kind === 'line' && e.tier === 'MV' ? COL.mv.clone().lerp(COL.cyan, 0.55) : COL.cyan;
      if (!e.energized && overlay !== 'tier') c = tmp.copy(COL.dead);
      u.uColor.value.copy(c);
      u.uDash.value = dash || (cb && overlay === 'capacity' && ratio >= 0.85) ? 1 : 0;
      u.uSpeed.value = e.kind === 'drop' ? 6 : 14;
      u.uOpacity.value = overlay === 'condition' ? 0.4 : !e.energized ? 0.85 : 1;
      v.wireMat.emissiveIntensity = v.energy * 0.5;
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
      const tier = n.kind === 'pole' ? n.tier : n.kind === 'gen' ? 'MV' : 'LV';
      if (overlay === 'condition' && (n.kind === 'xfmr' || n.kind === 'gen')) c = condColor(n.kind === 'gen' ? state.gen.condition : n.condition);
      else if (overlay === 'tier') c = tier === 'MV' ? COL.mv : COL.lv;
      else if (overlay === 'capacity' && n.kind === 'xfmr') c = loadColor(n.loadPct / 100);
      else c = n.energized ? (tier === 'MV' ? COL.mv.clone().lerp(COL.cyan, 0.55) : COL.cyan) : COL.dead;
      v.dotMat.color.copy(c);
      v.dotMat.opacity = n.energized || overlay !== 'flow' ? 1 : 0.6;
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
  const ghostPoleMat = new THREE.MeshBasicMaterial({ color: COL.ghostOk, transparent: true, opacity: 0.55, depthWrite: false });
  const ghostRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial());
  ghostRibbon.material.uniforms.uDash.value = 1;
  ghostRibbon.material.uniforms.uEnergy.value = 1;
  ghostRibbon.renderOrder = 3;
  ghostRoot.add(ghostRibbon);
  const ghostPoles = [];
  const ghostPoleGeo = new THREE.CylinderGeometry(0.35, 0.45, 8, 8);
  function showGhost(points, ok, time, tier = 'LV') {
    ghostRoot.visible = !!points;
    if (!points) return;
    const a = points[0];
    const b = points[points.length - 1];
    ghostRibbon.geometry.dispose();
    ghostRibbon.geometry = ribbonGeometry(a, b, tier === 'MV' ? 3.2 : 2.3, 0.3);
    const u = ghostRibbon.material.uniforms;
    u.uColor.value.copy(ok ? COL.ghostOk : COL.ghostBad);
    u.uLen.value = Math.hypot(b.x - a.x, b.z - a.z);
    u.uTime.value = time;
    u.uDouble.value = tier === 'MV' ? 1 : 0;
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

  return { root, sync, update, showGhost, views: () => views, attachPoint };
}
