// Tiny DOM helpers + inline SVG icon set (no external assets).

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const P = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="m12 14 4-5"/>',
  factory: '<path d="M3 21V10l6 4V10l6 4V5h6v16z"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h5v4H7z"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  wave: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  cursor: '<path d="m4 3 7 18 2.5-7.5L21 11z"/>',
  line: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5 17.5 6.5"/><path d="M5 13v-3M5 7V5h2M19 11v3M19 17v2h-2"/>',
  pole: '<path d="M12 3v18"/><path d="M6 6h12"/><path d="M7 6v2M17 6v2M12 6v2"/><path d="M9 21h6"/>',
  xfmr: '<rect x="6" y="6" width="12" height="13" rx="2"/><path d="M9 3v3M15 3v3"/><path d="m11 9-2 4h4l-2 4"/>',
  plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  ff: '<path d="M4 5v14l8-7zM12 5v14l8-7z"/>',
  fff: '<path d="M2 6v12l6-6zM9 6v12l6-6zM16 6v12l6-6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-2-2 1.3-1.3a4 4 0 0 1-5-5L3 9l3-3 3.7 3.7"/>',
  tool: '<path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2z"/>',
  clinic: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  market: '<path d="M3 9h18l-2-5H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  depot: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  gen: '<rect x="3" y="8" width="14" height="10" rx="1"/><path d="M17 11h3v4h-3"/><path d="M7 4v4M12 4v4"/><path d="m9 11-1.5 3h3L9 17"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  north: '<path d="M12 2 7 20l5-4 5 4z" fill="currentColor"/>',
  dark: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  thermo: '<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
  box: '<path d="m12 3 9 5v8l-9 5-9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  cable: '<path d="M4 20c0-6 4-6 8-6s8 0 8-6"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="6" r="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 13 11"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8"/>',
  plus: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  sub: '<path d="M4 20V10l4-3 4 3 4-3 4 3v10"/><path d="M8 7V3M16 7V3M4 14h16"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M7 10v4M11 10v4"/>',
  ev: '<rect x="5" y="3" width="10" height="18" rx="2"/><path d="m11 7-2 4h3l-2 4M15 9h3v6a2 2 0 0 1-2 2"/>',
  pump: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  office: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  shop: '<path d="M3 9h18l-2-5H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  news: '<rect x="3" y="5" width="15" height="14" rx="1.5"/><path d="M18 9h2a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H6"/><path d="M6 9h9M6 12h9M6 15h5"/>',
  storm: '<path d="M7 16a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.5 9 3.5 3.5 0 0 1 17 16"/><path d="M12 13l-2 4h3l-2 4"/>',
  people: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5M14 20c0-2.5 1.4-4 3-4s3 1.5 3 4"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;
}
