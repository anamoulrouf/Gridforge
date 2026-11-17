// Renderer, post-processing (bloom), lights, fog and the day/night cycle.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const PALETTE = {
  // Warm "toy diorama" lighting (reso/graphic): golden key from the upper left, soft sky fill,
  // the tile floating in a dark void. Night stays readable with cool moonlight.
  night: { sky: new THREE.Color('#0b0c10'), fog: new THREE.Color('#0b0c10'), hemiSky: new THREE.Color('#8496c4'), hemiGround: new THREE.Color('#2a2418'), hemi: 1.05, key: new THREE.Color('#aebfe6'), keyI: 0.95 },
  day: { sky: new THREE.Color('#17140f'), fog: new THREE.Color('#17140f'), hemiSky: new THREE.Color('#fff4e2'), hemiGround: new THREE.Color('#6b5634'), hemi: 1.35, key: new THREE.Color('#ffeacb'), keyI: 2.9 },
  dusk: { sky: new THREE.Color('#151016'), fog: new THREE.Color('#151016'), hemiSky: new THREE.Color('#d9a98a'), hemiGround: new THREE.Color('#2f2216'), hemi: 1.1, key: new THREE.Color('#ffae6b'), keyI: 2.0 },
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = PALETTE.night.sky.clone();
  scene.fog = new THREE.FogExp2(PALETTE.night.fog.clone(), 0.0011);

  const camera = new THREE.PerspectiveCamera(30, 1, 5, 3000);

  const hemi = new THREE.HemisphereLight(PALETTE.night.hemiSky, PALETTE.night.hemiGround, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(PALETTE.night.key, 0.6);
  key.position.set(-200, 280, -60);
  key.castShadow = true;
  const sc = key.shadow.camera;
  sc.left = -250;
  sc.right = 250;
  sc.top = 250;
  sc.bottom = -250;
  sc.near = 50;
  sc.far = 800;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.35;
  key.shadow.radius = 3;
  scene.add(key);
  scene.add(key.target);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let quality = 'high';
  function setQuality(q) {
    quality = q;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(1.5, dpr) : Math.min(2, dpr));
    composer.setPixelRatio(renderer.getPixelRatio());
    renderer.shadowMap.enabled = q !== 'low';
    key.castShadow = q !== 'low';
    bloom.enabled = q !== 'low';
    resize();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  /** Lighting by clock minute-of-day. Day stays moody; night matches the reference (deep navy). */
  function setTimeOfDay(minOfDay, override) {
    const h = minOfDay / 60;
    // weights: night (0) … day (1) with dusk/dawn tint
    let dayW = 0;
    if (h >= 7 && h < 17) dayW = 1;
    else if (h >= 5.5 && h < 7) dayW = (h - 5.5) / 1.5;
    else if (h >= 17 && h < 19) dayW = 1 - (h - 17) / 2;
    const duskW = Math.max(0, 1 - Math.abs(h - 18) / 1.2) * 0.9 + Math.max(0, 1 - Math.abs(h - 6.2) / 1.0) * 0.6;
    if (override === 'night') return mix(0, 0);
    return mix(dayW, Math.min(1, duskW));
  }
  function mix(dayW, duskW) {
    const N = PALETTE.night;
    const D = PALETTE.day;
    const K = PALETTE.dusk;
    const blend = (prop) => tmpA.copy(N[prop]).lerp(D[prop], dayW).lerp(K[prop], duskW * (1 - dayW * 0.6));
    scene.background.copy(blend('sky'));
    scene.fog.color.copy(blend('fog'));
    hemi.color.copy(blend('hemiSky'));
    hemi.groundColor.copy(tmpB.copy(N.hemiGround).lerp(D.hemiGround, dayW));
    hemi.intensity = N.hemi + (D.hemi - N.hemi) * dayW;
    key.color.copy(blend('key'));
    key.intensity = N.keyI + (D.keyI - N.keyI) * dayW + duskW * 0.2;
    // key light from the upper left of the default view (as in the reference renders)
    key.position.set(-200 + dayW * 40, 280, -60 + dayW * 30);
    bloom.strength = 0.75 - dayW * 0.45;
    bloom.threshold = 0.85 + dayW * 0.1;
    renderer.toneMappingExposure = 1.05 + dayW * 0.05;
    return { dayW, duskW };
  }

  return { renderer, scene, camera, composer, bloom, hemi, key, resize, setTimeOfDay, setQuality, get quality() { return quality; } };
}
