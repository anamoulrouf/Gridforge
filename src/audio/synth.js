// Procedural audio (GDD §16): UI cues, infrastructure hums, power feedback, alerts, night ambience
// and adaptive music layers that warm up as more customers are powered. No audio files.

export function createAudio() {
  let ctx = null;
  let master;
  let music;
  let sfx;
  let amb;
  let started = false;
  const settings = { master: 0.8, music: 0.55, sfx: 0.8, muted: false };
  let caption = () => {};
  let hum = null;
  let buzz = null;
  let layers = [];
  let musicTimer = null;
  let ambNodes = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    music = ctx.createGain();
    sfx = ctx.createGain();
    amb = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    music.connect(master);
    sfx.connect(master);
    amb.connect(master);
    master.connect(comp).connect(ctx.destination);
    apply();
    return ctx;
  }

  function apply() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
    music.gain.setTargetAtTime(settings.music * 0.55, t, 0.1);
    sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
    amb.gain.setTargetAtTime(settings.sfx * 0.45, t, 0.2);
  }

  /** Must be called from a user gesture (autoplay policy). */
  function unlock() {
    ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) {
      started = true;
      startAmbience();
      startMusic();
    }
  }

  const noiseBuf = () => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };

  function tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.2, attack = 0.005, at = 0, dest = null, q = null, cut = null }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (cut) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = cut;
      if (q) fl.Q.value = q;
      o.connect(fl);
      node = fl;
    }
    node.connect(g).connect(dest || sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.3, vol = 0.2, type = 'bandpass', f = 1200, q = 1, at = 0, dest = null, f2 = null }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf();
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl).connect(g).connect(dest || sfx);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
  }

  const cues = {
    click: () => tone({ f: 1400, f2: 900, dur: 0.05, vol: 0.06, type: 'triangle' }),
    hover: () => tone({ f: 2000, dur: 0.025, vol: 0.02, type: 'sine' }),
    select: () => tone({ f: 660, f2: 990, dur: 0.09, vol: 0.08, type: 'triangle' }),
    confirm: () => {
      tone({ f: 523, dur: 0.12, vol: 0.09, type: 'triangle' });
      tone({ f: 784, dur: 0.16, vol: 0.08, type: 'triangle', at: 0.06 });
    },
    cancel: () => tone({ f: 500, f2: 300, dur: 0.1, vol: 0.06, type: 'triangle' }),
    error: () => {
      tone({ f: 220, dur: 0.12, vol: 0.09, type: 'square', cut: 900 });
      tone({ f: 180, dur: 0.16, vol: 0.08, type: 'square', cut: 900, at: 0.09 });
    },
    build: () => {
      noise({ dur: 0.18, vol: 0.18, type: 'lowpass', f: 500 });
      tone({ f: 120, f2: 70, dur: 0.2, vol: 0.18, type: 'sine' });
      tone({ f: 1200, dur: 0.06, vol: 0.03, type: 'triangle', at: 0.05 });
    },
    remove: () => {
      noise({ dur: 0.25, vol: 0.12, type: 'lowpass', f: 900, f2: 200 });
      tone({ f: 300, f2: 120, dur: 0.22, vol: 0.08, type: 'triangle' });
    },
    connect: () => {
      tone({ f: 880, dur: 0.18, vol: 0.06, type: 'sine' });
      tone({ f: 1318, dur: 0.3, vol: 0.05, type: 'sine', at: 0.07 });
    },
    swell: () => {
      // grid activation: rising chord + shimmer
      [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => tone({ f, dur: 2.6, vol: 0.05, type: 'sawtooth', attack: 0.9, cut: 1800, at: i * 0.08 }));
      noise({ dur: 2.2, vol: 0.05, type: 'highpass', f: 5000, at: 0.4 });
      [1046, 1318, 1568, 2093].forEach((f, i) => tone({ f, dur: 0.6, vol: 0.03, type: 'sine', at: 0.9 + i * 0.12 }));
    },
    genStart: () => {
      noise({ dur: 0.9, vol: 0.18, type: 'lowpass', f: 300, f2: 900 });
      tone({ f: 40, f2: 95, dur: 1.4, vol: 0.2, type: 'sawtooth', cut: 400 });
    },
    warn: () => {
      tone({ f: 740, dur: 0.18, vol: 0.07, type: 'triangle' });
      tone({ f: 740, dur: 0.18, vol: 0.07, type: 'triangle', at: 0.26 });
    },
    critical: () => {
      for (let i = 0; i < 3; i++) {
        tone({ f: 880, f2: 660, dur: 0.22, vol: 0.08, type: 'square', cut: 2400, at: i * 0.28 });
      }
    },
    trip: () => {
      noise({ dur: 0.35, vol: 0.3, type: 'bandpass', f: 2500, q: 0.7 });
      tone({ f: 160, f2: 50, dur: 0.6, vol: 0.2, type: 'sawtooth', cut: 600 });
    },
    objective: () => {
      [659.3, 830.6, 987.8].forEach((f, i) => tone({ f, dur: 0.35, vol: 0.06, type: 'triangle', at: i * 0.09 }));
    },
    bill: () => {
      [1318, 1568].forEach((f, i) => tone({ f, dur: 0.2, vol: 0.05, type: 'sine', at: i * 0.08 }));
      noise({ dur: 0.08, vol: 0.05, type: 'highpass', f: 6000, at: 0.02 });
    },
    repair: () => {
      for (let i = 0; i < 4; i++) noise({ dur: 0.07, vol: 0.12, type: 'bandpass', f: 3000, q: 4, at: i * 0.14 });
    },
    victory: () => {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone({ f, dur: 1.4, vol: 0.06, type: 'triangle', attack: 0.02, at: i * 0.14 }));
    },
    fail: () => {
      [392, 349.2, 311.1, 261.6].forEach((f, i) => tone({ f, dur: 0.6, vol: 0.06, type: 'triangle', at: i * 0.22 }));
    },
  };

  const CAPTIONS = {
    genStart: '[generator starts]',
    swell: '[power surges through the grid]',
    warn: '[warning tone]',
    critical: '[alarm]',
    trip: '[breaker trips with a bang]',
    objective: '[objective complete]',
    bill: '[cash register chime]',
    repair: '[tools at work]',
    victory: '[triumphant chord]',
    fail: '[falling tones]',
  };

  function play(name) {
    if (!ctx || settings.muted) {
      if (CAPTIONS[name]) caption(CAPTIONS[name]);
      return;
    }
    cues[name]?.();
    if (CAPTIONS[name]) caption(CAPTIONS[name]);
  }

  // ---------------------------------------------------------------- continuous: generator hum, transformer buzz
  function setHum(level) {
    if (!ctx) return;
    if (!hum) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f);
      o2.connect(f);
      f.connect(g).connect(sfx);
      o.start();
      o2.start();
      hum = { o, o2, f, g };
    }
    const t = ctx.currentTime;
    hum.o.frequency.setTargetAtTime(38 + level * 26, t, 0.4);
    hum.o2.frequency.setTargetAtTime(19 + level * 13, t, 0.4);
    hum.g.gain.setTargetAtTime(level > 0 ? 0.025 + level * 0.035 : 0, t, 0.3);
  }
  function setBuzz(level) {
    if (!ctx) return;
    if (!buzz) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 100;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 200;
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(sfx);
      o.start();
      buzz = { g };
    }
    buzz.g.gain.setTargetAtTime(Math.max(0, level - 0.5) * 0.03, ctx.currentTime, 0.4);
  }

  // ---------------------------------------------------------------- night ambience (wind + crickets)
  function startAmbience() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf();
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency);
    s.connect(f).connect(g).connect(amb);
    s.start();
    lfo.start();
    ambNodes = { g, night: 1 };
    const chirp = () => {
      if (!ctx) return;
      const nightK = ambNodes.night;
      if (nightK > 0.3 && !settings.muted) {
        const base = 4200 + Math.random() * 600;
        for (let i = 0; i < 3; i++) tone({ f: base, dur: 0.035, vol: 0.012 * nightK, type: 'sine', at: i * 0.07, dest: amb });
      }
      setTimeout(chirp, 600 + Math.random() * 1800);
    };
    setTimeout(chirp, 1500);
  }
  function setNight(k) {
    if (ambNodes) ambNodes.night = k;
  }

  // ---------------------------------------------------------------- adaptive music (3 layers)
  function startMusic() {
    const chords = [
      [146.8, 220, 293.7, 349.2],
      [116.5, 174.6, 233.1, 293.7],
      [130.8, 196, 261.6, 329.6],
      [110, 164.8, 220, 277.2],
    ];
    layers = [0, 1, 2].map(() => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(music);
      return { g, target: 0 };
    });
    layers[0].target = 0.6;
    let step = 0;
    const bar = 4.8;
    const loop = () => {
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      const ch = chords[step % chords.length];
      // layer 0: soft pad
      ch.forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 8;
        const fl = ctx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.value = 700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03, t + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + bar + 0.8);
        o.connect(fl).connect(g).connect(layers[0].g);
        o.start(t);
        o.stop(t + bar + 1);
      });
      // layer 1: plucked arpeggio
      for (let i = 0; i < 8; i++) {
        const f = ch[[0, 2, 1, 3, 2, 1, 3, 2][i]] * 2;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        const tt = t + i * (bar / 8);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.05, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
        o.connect(g).connect(layers[1].g);
        o.start(tt);
        o.stop(tt + 0.6);
      }
      // layer 2: high shimmer
      [ch[2] * 4, ch[3] * 4].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        const tt = t + i * (bar / 2);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.018, tt + 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + bar / 2 + 0.6);
        o.connect(g).connect(layers[2].g);
        o.start(tt);
        o.stop(tt + bar / 2 + 0.8);
      });
      for (const L of layers) L.g.gain.setTargetAtTime(L.target, ctx.currentTime, 1.5);
      step++;
      musicTimer = setTimeout(loop, bar * 1000);
    };
    loop();
  }
  /** 0..13 powered customers → warmer, fuller music (thresholds 1, 7, 13). */
  function setWarmth(powered, mood = 'normal') {
    if (!layers.length) return;
    layers[0].target = mood === 'tense' ? 0.35 : 0.6;
    layers[1].target = powered >= 1 ? (mood === 'tense' ? 0.2 : 0.55) : 0;
    layers[2].target = powered >= 7 ? 0.7 : 0;
    if (powered >= 13) layers[2].target = 1;
  }

  return {
    unlock,
    play,
    setHum,
    setBuzz,
    setNight,
    setWarmth,
    set(s) {
      Object.assign(settings, s);
      apply();
    },
    onCaption(fn) {
      caption = fn;
    },
    get ready() {
      return !!ctx && ctx.state === 'running';
    },
    stopMusic() {
      clearTimeout(musicTimer);
    },
  };
}
