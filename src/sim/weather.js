// Deterministic weather (GDD §7.2 variable renewables, §10 events). Simplified model:
// hourly cloud cover (0–1), wind speed (m/s) and temperature (°C) from a seeded smooth noise,
// plus scripted days from the mission (heat wave, storm, calm overcast). Pure function of
// (seed, hour index) so replays and saves stay identical.
import { fnv } from './rng.js';

const h01 = (seed, k) => parseInt(fnv(`${seed}:${k}`), 16) / 4294967295;
/** Smooth value noise over hours with a given period. */
function noise(seed, hourIdx, period, salt) {
  const i = Math.floor(hourIdx / period);
  const f = hourIdx / period - i;
  const a = h01(seed, `${salt}:${i}`);
  const b = h01(seed, `${salt}:${i + 1}`);
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

/** Sun elevation factor by hour of day (0 at night, 1 at solar noon). */
export function sunAt(hourOfDay) {
  if (hourOfDay < 6 || hourOfDay >= 19) return 0;
  return Math.max(0, Math.sin(((hourOfDay - 6 + 0.5) / 13) * Math.PI));
}

/**
 * Weather for an absolute sim hour (0 = mission start hour).
 * `script` (mission.weather) may override by day: { [day]: { cloud, wind, temp, storm, calm, heat, label } }.
 */
export function weatherAt(seed, clockMin, script = {}) {
  const hourAbs = Math.floor(clockMin / 60);
  const hourOfDay = hourAbs % 24;
  const day = Math.floor(clockMin / 1440) + 1;
  let cloud = Math.min(1, Math.max(0, noise(seed, hourAbs, 9, 'c') * 0.9 - 0.1));
  let wind = 3 + noise(seed, hourAbs, 7, 'w') * 9; // 3–12 m/s
  let temp = 18 + 7 * Math.sin(((hourOfDay - 9) / 24) * Math.PI * 2) + (noise(seed, hourAbs, 24, 't') - 0.5) * 4;
  const s = script[day] || {};
  let label = s.label || null;
  if (s.heat) temp += 9;
  if (s.storm) {
    // storm peaks mid-day: winds above the turbines' 25 m/s cut-out, heavy cloud
    const k = Math.max(0, 1 - Math.abs(hourOfDay - (s.peakHour ?? 14)) / 7);
    wind = 10 + k * 20;
    cloud = Math.max(cloud, 0.85);
  }
  if (s.calm) {
    wind = 1.2 + noise(seed, hourAbs, 5, 'cw') * 1.4; // below cut-in
    cloud = Math.max(cloud, 0.88);
  }
  if (s.cloud != null) cloud = s.cloud;
  if (s.wind != null) wind = s.wind;
  return { hourAbs, hourOfDay, day, cloud, wind, temp, sun: sunAt(hourOfDay), label, storm: !!s.storm, calm: !!s.calm, heat: !!s.heat };
}

/** Solar output fraction of peak (kWp) for the given weather. */
export const solarFrac = (w) => w.sun * (1 - 0.78 * w.cloud);

/** Simplified wind-turbine power curve: cut-in 3 m/s, rated 12 m/s, cut-out 25 m/s. */
export function windFrac(w) {
  const v = w.wind;
  if (v < 3 || v >= 25) return 0;
  if (v >= 12) return 1;
  return Math.pow((v - 3) / 9, 3);
}

/** 24-hour forecast starting at the current hour. */
export function forecast(seed, clockMin, script, hours = 24) {
  const out = [];
  const h0 = Math.floor(clockMin / 60) * 60;
  for (let i = 0; i < hours; i++) out.push(weatherAt(seed, h0 + i * 60, script));
  return out;
}
