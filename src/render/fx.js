// Particles (smoke, steam, sparks, fireflies), selection ring and tutorial marker.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const MAX = 900;

export function createFx(scene) {
  // -------------------------------------------------------------- particles
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: glowTexture() }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC;
      uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; varying vec3 vC;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.a, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ alive: false });
  let cursor = 0;

  function spawn(p) {
    const q = parts[cursor];
    cursor = (cursor + 1) % MAX;
    Object.assign(q, { alive: true, age: 0, ...p, c: p.c.clone() });
  }

  const emitters = [];
  function addEmitter(e) {
    emitters.push({ acc: 0, on: true, ...e });
    return emitters[emitters.length - 1];
  }

  function burst(x, y, z, kind, n = 24) {
    for (let i = 0; i < n; i++) {
      if (kind === 'sparks') {
        const a = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 10;
        spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 9, vz: Math.sin(a) * sp, g: -22, life: 0.5 + Math.random() * 0.7, s0: 1.4, s1: 0.2, c: new THREE.Color(3, 1.6 + Math.random(), 0.4), fade: 1 });
      } else if (kind === 'build') {
        const a = (i / n) * Math.PI * 2;
        spawn({ x, y: 0.4, z, vx: Math.cos(a) * 7, vy: 0.5, vz: Math.sin(a) * 7, g: 0, life: 0.55, s0: 2.2, s1: 0.4, c: new THREE.Color(0.4, 1.8, 2.6), fade: 1 });
      } else if (kind === 'light') {
        const a = Math.random() * Math.PI * 2;
        spawn({ x: x + Math.cos(a) * 3, y: y + Math.random() * 3, z: z + Math.sin(a) * 3, vx: 0, vy: 2 + Math.random() * 2, vz: 0, g: 0, life: 1.4, s0: 1.6, s1: 0, c: new THREE.Color(2.4, 1.5, 0.6), fade: 1 });
      }
    }
  }

  function update(dt, opts) {
    for (const e of emitters) {
      if (!e.on) continue;
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        spawn(e.make());
      }
    }
    let n = 0;
    for (const p of parts) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age > p.life) {
        p.alive = false;
        continue;
      }
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.drift) {
        p.vx += p.drift * dt;
      }
      const f = p.age / p.life;
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = p.z;
      const a = p.fade ? 1 - f : Math.sin(f * Math.PI);
      col[n * 3] = p.c.r * a;
      col[n * 3 + 1] = p.c.g * a;
      col[n * 3 + 2] = p.c.b * a;
      size[n] = p.s0 + (p.s1 - p.s0) * f;
      n++;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    mat.uniforms.uScale.value = window.innerHeight * 0.9;

    // rings
    const t = opts.time;
    selRing.rotation.z = t * 0.6;
    const pulse = 1 + Math.sin(t * 4) * 0.08;
    selRing.scale.setScalar(selRing.userData.r * pulse);
    tutRing.scale.setScalar(tutRing.userData.r * (1 + ((t * 0.9) % 1) * 0.5));
    tutRing.material.opacity = 1 - ((t * 0.9) % 1);
    tutBeam.material.opacity = 0.12 + Math.sin(t * 3) * 0.05;
  }

  // -------------------------------------------------------------- selection + tutorial rings
  const ringTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.setLineDash([26, 14]);
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const selRing = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: ringTex, color: new THREE.Color(0.9, 2.4, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.position.y = 0.4;
  selRing.visible = false;
  selRing.userData.r = 6;
  scene.add(selRing);
  const tutRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.5, 0.25), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  tutRing.rotation.x = -Math.PI / 2;
  tutRing.position.y = 0.45;
  tutRing.visible = false;
  tutRing.userData.r = 8;
  scene.add(tutRing);
  const tutBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 0.25), transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending }));
  tutBeam.position.y = 20;
  tutBeam.visible = false;
  scene.add(tutBeam);

  function select(x, z, r) {
    selRing.visible = x != null;
    if (x == null) return;
    selRing.position.x = x;
    selRing.position.z = z;
    selRing.userData.r = r;
  }
  function marker(x, z, r = 8) {
    tutRing.visible = tutBeam.visible = x != null;
    if (x == null) return;
    tutRing.position.set(x, 0.45, z);
    tutBeam.position.set(x, 20, z);
    tutRing.userData.r = r;
  }

  return { spawn, burst, addEmitter, update, select, marker };
}
