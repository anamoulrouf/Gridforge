// Player-facing side of run events: alerts with one-click responses, advisor lines, map focus,
// the community/protest choice cards and the Gazette headlines.
import { fmt } from '../data/strings.js';
import { CAST } from '../data/dialogue.js';
import { zoneCenter } from '../render/hazards.js';
import { questView } from '../sim/quests.js';
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const hrs = (min) => {
  const h = Math.round(min / 60);
  return h <= 1 ? 'about an hour' : `about ${h} hours`;
};
const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
/** "T2, two 11 kV lines and a 66 kV line": repeated names are counted, not repeated. */
const list = (names) => {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  const parts = [...counts].map(([n, k]) => (k === 1 ? n : `${NUM[k] || k} ${n.replace(/line$/, 'lines')}`));
  return parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

export function createEventUI(d) {
  const { hud, menus, audio, hazards, fx } = d;
  const deckItem = (id) => d.S_().ev?.deck.find((x) => x.id === id);
  const zoneInfo = (z) => zoneCenter(z);
  const flyZone = (z, k = 2.4) => {
    const c = zoneInfo(z);
    d.rig.flyTo(c.x, c.z, Math.max(160, Math.min(520, c.r * k)));
  };
  const flyTrack = ([x1, z1, x2, z2]) => d.rig.flyTo((x1 + x2) / 2, (z1 + z2) / 2, Math.min(700, Math.hypot(x2 - x1, z2 - z1) * 0.9 + 120));
  const assetName = (id) => {
    const st = d.S_();
    if (st.nodes[id]) return d.xfmrName(id);
    const e = st.edges[id];
    return e ? `${d.tierName(e.tier)} line` : id;
  };
  const repairAll = (ids) => {
    let sent = 0;
    for (const id of ids) {
      const st = d.S_();
      const broken = st.nodes[id]?.state === 'fault' || st.edges[id]?.state === 'fault';
      if (broken && !d.crewBusy(id) && d.cmd({ type: 'repair', target: id }, true).ok) sent++;
    }
    if (sent) audio.play('confirm');
    else d.cmd({ type: 'repair', target: ids[0] });
  };
  const contractorsAct = () => {
    const st = d.S_();
    const cost = d.bal().costs.contractors ?? 1200;
    return st.ev && st.ev.boostUntil <= st.t ? { label: `Hire contractors · ${fmt.cr(cost)}`, fn: () => d.cmd({ type: 'contractors' }) } : null;
  };
  const protectZone = (ids) => {
    let n = 0;
    for (const id of ids) if (d.cmd({ type: 'protect', target: id }, true).ok) n++;
    audio.play(n ? 'confirm' : 'error');
    hud.alert({ id: 'iso-done', level: n ? 'good' : 'info', title: n ? `Crew ready to switch off ${n} transformer${n === 1 ? '' : 's'}` : 'Nothing to protect', text: n ? 'They’ll switch off as the water arrives and back on once it has gone down. Customers there lose power only while the water is up.' : 'There’s no working equipment of yours in that area.', ttl: 8000 });
  };
  const isolateZone = (zone, on) => {
    const st = d.S_();
    let n = 0;
    for (const id in st.nodes) {
      const x = st.nodes[id];
      if (x.kind !== 'xfmr') continue;
      const c = zoneInfo(zone);
      const inside = zone.poly ? d.inZone(x, zone) : Math.hypot(x.x - c.x, x.z - c.z) <= c.r;
      if (!inside) continue;
      if (on ? x.state === 'isolated' : x.state === 'ok') if (d.cmd({ type: 'isolate', target: id, on }, true).ok) n++;
    }
    audio.play(n ? 'confirm' : 'error');
    hud.alert({ id: 'iso-done', level: n ? 'good' : 'info', title: on ? (n ? `${n} switched back on` : 'Nothing to switch on') : n ? `${n} switched off safely` : 'Nothing to switch off', text: on ? '' : n ? 'They’ll ride out the water. Switch them back on once it has gone down.' : 'There’s no working equipment of yours in that area.', ttl: 6000 });
  };

  // ------------------------------------------------------------ choices queue (shown one at a time)
  const queue = [];
  let open = false;
  function nextChoice() {
    if (open || !queue.length || d.mode() !== 'game') return;
    if (menus.isOpen()) return void setTimeout(nextChoice, 600); // wait for any open card first
    const id = queue.shift();
    const ch = d.S_().ev?.choices[id];
    if (!ch || ch.done) return nextChoice();
    open = true;
    d.hold(+1);
    if (ch.at) d.rig.flyTo(ch.at.x, ch.at.z, 180);
    audio.play(ch.kind === 'protest' ? 'warn' : 'objective');
    menus.choice(ch, {
      cast: ch.kind === 'protest' ? null : d.mission().cast?.[ch.who] || CAST[ch.who] || null,
      onPick: (i) => {
        open = false;
        d.hold(-1);
        d.cmd({ type: 'choose', ev: id, opt: i });
        setTimeout(nextChoice, 300);
      },
      onLater: () => {
        open = false;
        d.hold(-1);
        hud.alert({ id: 'later-' + id, level: 'info', title: ch.title, text: `You can answer from the Community panel. If you don’t answer within ${hrs(ch.until - d.S_().t)}, it counts as “${ch.options[ch.options.length - 1].label}”.`, actions: [{ label: 'Answer now', primary: true, fn: () => openChoice(id) }], ttl: 12000 });
        setTimeout(nextChoice, 300);
      },
    });
  }
  function openChoice(id) {
    hud.dismiss('later-' + id);
    if (!queue.includes(id)) queue.push(id);
    nextChoice();
  }

  // ------------------------------------------------------------ events
  function handle(e) {
    const st = d.S_();
    const it = e.id ? deckItem(e.id) : null;
    const p = it?.p || {};
    switch (e.type) {
      case 'evWarn': {
        audio.play('warn');
        if (e.kind === 'xfmrFail') {
          const nm = d.xfmrName(e.target);
          hud.alert({ id: 'ev-' + e.id, level: 'warn', title: `${nm} is humming and running hot`, text: `It could fail in ${hrs(e.inMin)}. Send the crew to service it before then and it will be fine.`, actions: [{ label: 'Service it now', primary: true, fn: () => d.cmd({ type: 'maintain', target: e.target }) }, { label: 'Show me', fn: () => d.focus({ kind: 'node', id: e.target }) }] });
          hud.say('sofia', `${nm} sounds wrong. That buzz means it’s wearing out. A quick service now saves a breakdown later.`);
        } else if (e.kind === 'flood' || e.kind === 'tsunami') {
          const n = (e.at || []).length;
          const tsu = e.kind === 'tsunami';
          hud.alert({ id: 'ev-' + e.id, level: 'critical', title: tsu ? `Tsunami warning: waves in ${hrs(e.inMin)}` : `Flash flood expected in ${hrs(e.inMin)}`, text: `${tsu ? 'An earthquake out at sea has sent a wave towards' : 'Heavy rain upstream will flood'} ${p.area || 'the low ground'} (the dashed ring). ${n ? `${n} of your transformers ${n === 1 ? 'is' : 'are'} in the way. Live equipment gets wrecked by water. Ask the crew to switch ${n === 1 ? 'it' : 'them'} off as the water arrives.` : 'None of your equipment is there yet. Don’t build there until it’s over.'}`, actions: [n ? { label: 'Protect them', primary: true, fn: () => protectZone(e.at) } : null, { label: 'Show me', fn: () => flyZone(p.zone) }].filter(Boolean) });
          hud.say('sofia', tsu ? 'Tsunami warning! Switch off everything on the waterfront. Wet equipment that’s still live gets wrecked.' : 'Flood coming. Equipment that’s switched off survives the water. Live equipment doesn’t.');
          flyZone(p.zone);
        } else if (e.kind === 'cyclone') {
          hud.alert({ id: 'ev-' + e.id, level: 'critical', title: `Cyclone ${p.name || ''} arrives in ${hrs(e.inMin)}`.replace('  ', ' '), text: `Expect storm-force wind for ${Math.round((it.endAt - it.hitAt) / 60)} hours along the shaded path. Wind turbines shut down to protect themselves, and some power lines on the path may come down. Get ready: charge batteries, start backup supply and keep repair kits handy.`, actions: [{ label: 'Show the path', primary: true, fn: () => flyTrack(p.track) }, { label: 'Supply panel', fn: () => d.select({ kind: 'mix' }) }, contractorsAct()].filter(Boolean) });
          hud.say('sofia', 'A cyclone is on its way. We can’t stop it, but we can be ready: full batteries, backup running, crew on standby.');
          flyTrack(p.track);
        } else if (e.kind === 'blackout') {
          const nm = d.srcName(e.target);
          hud.alert({ id: 'ev-' + e.id, level: 'critical', title: `${nm} is showing trouble`, text: `Alarms say it could trip in ${hrs(e.inMin)} and stay off for ${Math.round((it.endAt - it.hitAt) / 60)} hours. Start your backup supply now so the lights stay on when it goes.`, actions: [{ label: 'Supply panel', primary: true, fn: () => d.select({ kind: 'mix' }) }, { label: 'Show me', fn: () => d.focus({ kind: 'gen', id: e.target }) }] });
          hud.say('sofia', `${nm} has a fault building up. Get something else running before it trips.`);
        } else if (e.kind === 'arrivals') {
          hud.alert({ id: 'ev-' + e.id, level: 'info', title: p.title || 'New neighbours on the way', text: `${p.text || 'New buildings are going up.'} They’ll be ready in ${hrs(e.inMin)} and will want power on day one.`, actions: p.at ? [{ label: 'Show me', primary: true, fn: () => d.rig.flyTo(p.at.x, p.at.z, 200) }] : [] });
          hud.say('maya', p.say || 'New families are moving in. Let’s have their lights on from the first night.');
        } else if (e.kind === 'storm') {
          hud.alert({ id: 'ev-' + e.id, level: 'warn', title: `Thunderstorm in ${hrs(e.inMin)}`, text: `Lightning and falling branches could bring down ${p.max > 1 ? 'a couple of lines' : 'a line'} for about ${Math.round((it.endAt - it.hitAt) / 60)} hours. Solar output drops under the clouds. Keep repair kits handy, or hire contractors so repairs go twice as fast.`, actions: [contractorsAct(), { label: 'Supply panel', fn: () => d.select({ kind: 'mix' }) }].filter(Boolean) });
          hud.say('sofia', 'Thunderstorm on the way. If a line comes down, send the crew straight away.');
        } else if (e.kind === 'heat') {
          hud.alert({ id: 'ev-' + e.id, level: 'warn', title: `Heat wave in ${hrs(e.inMin)}`, text: `Fans and air conditioning will push demand up by ${Math.round(((p.mult ?? 1.2) - 1) * 100)}% from ${String(p.startH ?? 13).padStart(2, '0')}:00 for ${Math.round((it.endAt - it.hitAt) / 60)} hours. Check your busiest transformers and lines have spare capacity, and have backup supply ready.`, actions: [{ label: 'Supply panel', primary: true, fn: () => d.select({ kind: 'mix' }) }] });
          hud.say('maya', 'It’s going to be scorching. People will need their fans running all afternoon.');
        } else if (e.kind === 'inspection') {
          hud.alert({ id: 'ev-' + e.id, level: 'info', title: `Safety inspectors visit in ${hrs(e.inMin)}`, text: `They’ll check every transformer and line. Anything broken, switched off by protection or over its limit counts against you. A clean report earns a ${fmt.cr(p.grant ?? 400)} grant.` });
          hud.say('sofia', 'Inspectors are coming. Fix anything broken and make sure nothing is overloaded before they arrive.');
        } else if (e.kind === 'theft') {
          hud.say('sofia', 'Cable thieves strip copper from live lines. Guards are cheaper than a repair and a dark street.');
        } else if (e.kind === 'vipVisit') {
          hud.alert({ id: 'ev-' + e.id, level: 'info', title: `${p.name || 'The minister'} visits in ${hrs(e.inMin)}`, text: `${p.text || 'A visit is planned to the district inside the dashed ring.'} Keep all ${e.ids.length} connected building${e.ids.length === 1 ? '' : 's'} there lit for the ${Math.round((it.endAt - it.hitAt) / 60)}-hour tour and you earn a ${fmt.cr(p.grant ?? 300)} grant.`, actions: [{ label: 'Show me', primary: true, fn: () => flyZone(p.zone) }] });
          hud.say(p.who || 'maya', p.say || 'Important visitors are coming. Let’s make sure the lights stay on while they’re here.');
        } else if (e.kind === 'wildfire') {
          const n = (e.at || []).length;
          hud.alert({ id: 'ev-' + e.id, level: 'critical', title: `Wildfire heading for ${p.area || 'the hills'} in ${hrs(e.inMin)}`, text: `Dry wind is pushing a fire towards the dashed ring. ${n ? `${n} of your transformers ${n === 1 ? 'is' : 'are'} in its path. Fire crews need power switched off, and switched-off equipment is much more likely to survive. Ask your crew to switch ${n === 1 ? 'it' : 'them'} off as the fire arrives.` : 'None of your transformers are there, but nearby lines may burn.'}`, actions: [n ? { label: 'Protect them', primary: true, fn: () => protectZone(e.at) } : null, { label: 'Show me', fn: () => flyZone(p.zone) }, contractorsAct()].filter(Boolean) });
          hud.say('sofia', 'Wildfire! Live lines can spark more fires, so we switch off before it arrives and repair after.');
          flyZone(p.zone);
        } else if (e.kind === 'landslide') {
          hud.alert({ id: 'ev-' + e.id, level: 'warn', title: `Landslide risk in ${hrs(e.inMin)}`, text: `Heavy rain is loosening the slope ${p.area ? `near ${p.area}` : 'inside the dashed ring'}. Poles and lines there could come down. Keep repair kits handy and the crew free.`, actions: [{ label: 'Show me', primary: true, fn: () => flyZone(p.zone) }, contractorsAct()].filter(Boolean) });
          hud.say('sofia', 'The hillside is soaked. If it slides, we’ll have lines down. Crew on standby.');
        } else if (e.kind === 'cyberAlert') {
          hud.say('advisor', 'Hackers go for the substations that feed the most people. A patch now is cheaper than a blackout.');
        } else if (e.kind === 'dustStorm') {
          hud.alert({ id: 'ev-' + e.id, level: 'warn', title: `Dust storm in ${hrs(e.inMin)}`, text: `A wall of dust will cover your solar panels. They’ll make about ${Math.round((p.loss ?? 0.6) * 100)}% less power until your crew washes them. Have other supply ready.`, actions: [{ label: 'Supply panel', primary: true, fn: () => d.select({ kind: 'mix' }) }] });
          hud.say('sofia', 'Dust storm coming. Dirty panels can’t see the sun. We’ll need to wash them afterwards.');
        } else if (e.kind === 'festival') {
          hud.alert({ id: 'ev-' + e.id, level: 'info', title: `${p.name} in ${hrs(e.inMin)}`, text: `${p.text} Demand there goes up by ${Math.round(((p.mult ?? 1.6) - 1) * 100)}% from ${String(p.startH ?? 18).padStart(2, '0')}:00 for ${Math.round((it.endAt - it.hitAt) / 60)} hours. Keep everyone lit for a big boost to your reputation.`, actions: p.at ? [{ label: 'Show me', primary: true, fn: () => d.rig.flyTo(p.at.x, p.at.z, 220) }] : [] });
          hud.say('maya', p.say || 'Everyone is talking about the celebration. Please don’t let the lights go out!');
        }
        return true;
      }
      case 'evHit': {
        hud.dismiss('ev-' + e.id);
        const dmg = e.damaged || [];
        const names = dmg.map(assetName);
        const fixActs = dmg.length ? [{ label: dmg.length > 1 ? `Repair all ${dmg.length}` : 'Send the crew', primary: true, fn: () => repairAll(dmg) }, contractorsAct(), { label: 'Show me', fn: () => (d.S_().nodes[dmg[0]] ? d.focus({ kind: 'node', id: dmg[0] }) : d.focus({ kind: 'edge', id: dmg[0] })) }].filter(Boolean) : [];
        if (e.kind === 'quake') {
          audio.play('trip');
          hazards.shake(2.6, 3);
          const c = zoneInfo(p.zone);
          fx.burst(c.x, 2, c.z, 'sparks', 30);
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: dmg.length ? `Earthquake! ${dmg.length} ${dmg.length === 1 ? 'piece' : 'pieces'} of equipment damaged` : 'Earthquake! No damage to the grid', text: dmg.length ? `${list(names)} ${dmg.length === 1 ? 'is' : 'are'} broken. Each needs a crew visit. The emergency fund pays for disaster repairs.` : 'The shaking was strong, but everything held. Lucky!', actions: fixActs });
          hud.say('sofia', dmg.length ? 'That was a big one. Let’s get the crew moving. The busiest lines first.' : 'Everyone okay? The grid held up. Good build.');
        } else if (e.kind === 'xfmrFail') {
          audio.play('trip');
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: `${d.xfmrName(e.target)} has failed`, text: 'Customers it feeds are dark until a crew replaces its parts.', actions: fixActs });
        } else if (e.kind === 'flood' || e.kind === 'tsunami') {
          audio.play('trip');
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: e.kind === 'tsunami' ? 'The tsunami has reached the shore' : 'The flood is here', text: `${dmg.length ? `${list(names)} ${dmg.length === 1 ? 'was' : 'were'} damaged by the water.` : 'Nothing of yours was damaged.'} ${e.saved?.length ? `${e.saved.length} switched-off transformer${e.saved.length === 1 ? '' : 's'} came through fine.` : ''} The water goes down in ${Math.round((it.endAt - it.hitAt) / 60)} hours.`, actions: fixActs });
        } else if (e.kind === 'cyclone') {
          audio.play('trip');
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: `Cyclone ${p.name || ''} has made landfall`.replace('  ', ' '), text: dmg.length ? `${list(names)} came down in the wind.` : 'The lines held. Wind turbines have shut down until it passes.', actions: fixActs });
        } else if (e.kind === 'blackout') {
          audio.play('trip');
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: `${d.srcName(e.target)} has tripped`, text: `It will be back in ${Math.round((it.endAt - it.hitAt) / 60)} hours. Until then, run backup supply and let the shed policy protect critical customers.`, actions: [{ label: 'Supply panel', primary: true, fn: () => d.select({ kind: 'mix' }) }] });
        } else if (e.kind === 'arrivals') {
          audio.play('objective');
          hud.alert({ id: 'hit-' + e.id, level: 'info', title: `${e.ids.length} new building${e.ids.length === 1 ? '' : 's'} need power`, text: 'Connect them with service drops (C). Getting them on quickly earns goodwill.', actions: p.at ? [{ label: 'Show me', primary: true, fn: () => d.rig.flyTo(p.at.x, p.at.z, 200) }] : [] });
        } else if (e.kind === 'storm') {
          audio.play(dmg.length ? 'trip' : 'warn');
          hud.alert({ id: 'hit-' + e.id, level: dmg.length ? 'critical' : 'info', title: dmg.length ? `Storm damage: ${list(names)} down` : 'The storm is here', text: dmg.length ? 'Customers beyond the break are dark until the crew repairs it. The emergency fund pays the labour.' : 'Heavy rain and lightning, but your lines are holding so far.', actions: fixActs });
        } else if (e.kind === 'heat') {
          audio.play('warn');
          hud.alert({ id: 'hit-' + e.id, level: 'warn', title: 'The heat wave has arrived', text: 'Demand is up everywhere. Watch for overloaded transformers and lines.', ttl: 9000 });
        } else if (e.kind === 'inspection') {
          audio.play(e.ok ? 'objective' : 'warn');
          hud.alert({ id: 'hit-' + e.id, level: e.ok ? 'good' : 'warn', title: e.ok ? `Clean inspection: ${fmt.cr(e.grant)} grant` : `Inspectors found ${e.issues.length} problem${e.issues.length === 1 ? '' : 's'}`, text: e.ok ? 'Nothing broken, nothing overloaded. The regulator is impressed.' : `${list(e.issues.map(assetName))} ${e.issues.length === 1 ? 'was' : 'were'} broken, tripped or over the limit. Fix ${e.issues.length === 1 ? 'it' : 'them'} to keep people’s trust.`, actions: e.ok ? [] : [{ label: 'Show me', primary: true, fn: () => (d.S_().nodes[e.issues[0]] ? d.focus({ kind: 'node', id: e.issues[0] }) : d.focus({ kind: 'edge', id: e.issues[0] })) }], ttl: e.ok ? 9000 : 0 });
        } else if (e.kind === 'theft') {
          if (dmg.length) {
            audio.play('trip');
            hud.alert({ id: 'hit-' + e.id, level: 'critical', title: 'Thieves cut a power line', text: `The ${list(names)} is down. Customers beyond it are dark until the crew replaces the cable.`, actions: fixActs });
          }
        } else if (e.kind === 'festival') {
          audio.play('swell');
        } else if (e.kind === 'vipVisit') {
          audio.play('objective');
          hud.alert({ id: 'hit-' + e.id, level: 'info', title: `${p.name || 'The minister'} has arrived`, text: 'The tour has started. Keep every building in the ring lit.', ttl: 8000 });
        } else if (e.kind === 'wildfire') {
          audio.play('trip');
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: 'The fire has reached the grid', text: `${dmg.length ? `${list(names)} ${dmg.length === 1 ? 'was' : 'were'} burnt.` : 'Nothing of yours burnt.'} ${e.saved?.length ? `${e.saved.length} switched-off transformer${e.saved.length === 1 ? '' : 's'} came through fine.` : ''} Fire crews expect it out in ${Math.round((it.endAt - it.hitAt) / 60)} hours.`, actions: fixActs });
        } else if (e.kind === 'landslide') {
          audio.play(dmg.length ? 'trip' : 'warn');
          hazards.shake(1.2, 1.4);
          hud.alert({ id: 'hit-' + e.id, level: dmg.length ? 'critical' : 'info', title: dmg.length ? `Landslide: ${list(names)} down` : 'The slope gave way, but missed your lines', text: dmg.length ? 'Customers beyond the break are dark until the crew repairs it. The emergency fund pays the labour.' : 'Lucky. Everything is still standing.', actions: fixActs });
        } else if (e.kind === 'cyberAlert') {
          audio.play('trip');
          hud.alert({ id: 'hit-' + e.id, level: 'critical', title: `Hackers switched off ${d.xfmrName(e.target)}`, text: 'Nothing is broken. Your engineers are locking them out. Reset it as soon as the button unlocks (about 15 minutes).', actions: [{ label: 'Reset it', primary: true, fn: () => d.cmd({ type: 'reset', target: e.target }) }, { label: 'Show me', fn: () => d.focus({ kind: 'node', id: e.target }) }] });
        } else if (e.kind === 'dustStorm') {
          audio.play('warn');
          hud.alert({ id: 'hit-' + e.id, level: 'warn', title: 'The dust storm is here', text: `${(e.dusty || []).length ? `${e.dusty.length} solar ${e.dusty.length === 1 ? 'park is' : 'parks are'} covered in dust.` : 'You have no solar panels to cover, lucky you.'} Wash them once it passes.`, ttl: 9000 });
        }
        return true;
      }
      case 'evAvoided':
        audio.play('objective');
        hud.dismiss('ev-' + e.id);
        if (e.kind === 'theft') hud.alert({ id: 'av-' + e.id, level: 'good', title: 'Thieves scared off', text: 'The night guards kept your cable safe.', ttl: 7000 });
        else if (e.kind === 'cyberAlert') hud.alert({ id: 'av-' + e.id, level: 'good', title: 'Hackers locked out', text: 'The security patch held. Nothing switched off.', ttl: 7000 });
        else hud.alert({ id: 'av-' + e.id, level: 'good', title: 'Breakdown avoided', text: `The service on ${d.xfmrName(e.target)} caught the problem in time.`, ttl: 7000 });
        return true;
      case 'evEnd':
        if (e.kind === 'wildfire') {
          const iso = Object.values(st.nodes).filter((n) => n.state === 'isolated').length;
          const back = (e.back || []).length;
          hud.alert({ id: 'end-' + e.id, level: 'good', title: 'The fire is out', text: `${back ? `Your crew switched ${back} transformer${back === 1 ? '' : 's'} back on. ` : ''}${iso ? `${iso} ${iso === 1 ? 'is' : 'are'} still switched off.` : 'It’s safe to build there again.'}`, actions: iso ? [{ label: 'Switch back on', primary: true, fn: () => isolateZone(p.zone, true) }] : [], ttl: iso ? 0 : 8000 });
        } else if (e.kind === 'flood' || e.kind === 'tsunami') {
          const iso = Object.values(st.nodes).filter((n) => n.state === 'isolated').length;
          const back = (e.back || []).length;
          hud.alert({ id: 'end-' + e.id, level: 'good', title: 'The water has gone down', text: `${back ? `Your crew switched ${back} transformer${back === 1 ? '' : 's'} back on. ` : ''}${iso ? `${iso} ${iso === 1 ? 'is' : 'are'} still switched off.` : 'It’s safe to build there again.'}`, actions: iso ? [{ label: 'Switch back on', primary: true, fn: () => isolateZone(p.zone, true) }] : [], ttl: iso ? 0 : 8000 });
        } else if (e.kind === 'cyclone') hud.alert({ id: 'end-' + e.id, level: 'good', title: 'The cyclone has passed', text: 'Wind turbines are starting up again.', ttl: 7000 });
        else if (e.kind === 'blackout') hud.alert({ id: 'end-' + e.id, level: 'good', title: `${d.srcName(e.target)} is starting up again`, text: 'It takes a little while to ramp back up to full power.', ttl: 7000 });
        else if (e.kind === 'storm') hud.alert({ id: 'end-' + e.id, level: 'good', title: 'The storm has passed', text: 'Skies are clearing and solar output is coming back.', ttl: 7000 });
        else if (e.kind === 'heat') hud.alert({ id: 'end-' + e.id, level: e.ok ? 'good' : 'warn', title: e.ok ? 'Everyone kept cool' : 'The heat wave caught us out', text: e.ok ? 'Power held through the hottest hours. People noticed.' : `Only ${e.pct}% of the afternoon had power. People are unhappy.`, ttl: 9000 });
        else if (e.kind === 'vipVisit') hud.alert({ id: 'end-' + e.id, level: e.ok ? 'good' : 'warn', title: e.ok ? `${p.name || 'The minister'} left impressed: ${fmt.cr(e.grant)} grant` : `${p.name || 'The minister'} saw the lights go out`, text: e.ok ? 'Every building on the tour stayed lit. Expect good headlines.' : `Only ${e.pct}% of the tour had power. Not the impression we wanted.`, ttl: 9000 });
        else if (e.kind === 'landslide') hud.alert({ id: 'end-' + e.id, level: 'good', title: 'The slope is stable again', text: 'Geologists say it’s safe to work there.', ttl: 6000 });
        else if (e.kind === 'dustStorm') {
          const dusty = e.dusty || [];
          hud.alert({ id: 'end-' + e.id, level: dusty.length ? 'warn' : 'good', title: dusty.length ? 'The dust has settled on your panels' : 'The dust storm has passed', text: dusty.length ? `${dusty.length === 1 ? 'One solar park is' : `${dusty.length} solar parks are`} still covered and making less power. Send the crew to wash ${dusty.length === 1 ? 'it' : 'them'} (about an hour each).` : 'Skies are clearing.', actions: dusty.length ? [{ label: dusty.length > 1 ? `Wash all ${dusty.length}` : 'Wash the panels', primary: true, fn: () => { let k = 0; for (const id of dusty) if (d.cmd({ type: 'cleanPanels', target: id }, true).ok) k++; audio.play(k ? 'confirm' : 'error'); } }] : [], ttl: dusty.length ? 0 : 7000 });
        } else if (e.kind === 'festival') hud.alert({ id: 'end-' + e.id, level: e.ok ? 'good' : 'warn', title: e.ok ? `${p.name}: a night to remember` : `${p.name}: the lights let people down`, text: e.ok ? 'Everyone stayed lit. People will remember that.' : `Only ${e.pct}% of the evening had power. Expect some grumbling.`, ttl: 9000 });
        return true;
      case 'evRestored':
        hud.alert({ id: 'rs-' + e.id, level: 'good', title: 'All repairs done', text: `Everything damaged by the ${d.LABEL[e.kind] || 'event'} is back in service after ${e.hours < 1.5 ? 'under 2 hours' : `${Math.round(e.hours)} hours`}.`, ttl: 7000 });
        return true;
      case 'emergencyKits':
        hud.alert({ id: 'kits', level: 'info', title: `${e.n} emergency repair kit${e.n === 1 ? '' : 's'} sent`, text: 'The regional depot has sent spare parts, and the emergency fund pays the crew’s labour for disaster repairs.', ttl: 8000 });
        return true;
      case 'contractors':
        audio.play('confirm');
        hud.alert({ id: 'contractors', level: 'good', title: 'Contractor crew on site', text: 'For the next 12 hours your crew travels and repairs twice as fast.', ttl: 7000 });
        return true;
      case 'cleanStart':
        hud.say('sofia', `Crew washing the panels at ${d.srcName(e.target)}. About an hour.`);
        return true;
      case 'cleaned':
        audio.play('confirm');
        hud.say('sofia', `${d.srcName(e.target)} is clean. Full power from the sun again.`);
        return true;
      case 'isolated':
      case 'protected':
        audio.play('click');
        return true;
      case 'news':
        d.onNews(e);
        return true;
      case 'choice':
        openChoice(e.id);
        return true;
      case 'choiceMade':
        hud.dismiss('later-' + e.id);
        return true;
      case 'choiceExpired':
        hud.dismiss('later-' + e.id);
        if (st.ev?.choices[e.id]?.kind === 'warning' && deckItem(e.id)?.kind === 'cyberAlert') hud.alert({ id: 'exp-' + e.id, level: 'warn', title: 'No patch installed', text: 'If the hackers get in, a substation switches off. Reset it straight away.', ttl: 7000 });
        else if (st.ev?.choices[e.id]?.kind === 'warning') hud.alert({ id: 'exp-' + e.id, level: 'warn', title: 'No guards hired', text: 'The line is unguarded tonight. If it’s cut, send the crew.', ttl: 7000 });
        else hud.alert({ id: 'exp-' + e.id, level: 'warn', title: 'No answer given', text: 'People took your silence as a no.', ttl: 7000 });
        return true;
      case 'beat': {
        const lines = e.lines || [];
        lines.forEach((t, i) => setTimeout(() => d.mode() === 'game' && hud.say(e.who, t), i * 2600));
        audio.play('click');
        return true;
      }
      case 'questNew': {
        const q = d.S_().q?.list.find((x) => x.id === e.id);
        if (!q) return true;
        audio.play('objective');
        const v = questView(d.S_(), q, d.bal());
        hud.alert({ id: 'qn-' + q.id, level: 'info', title: `New task for today: ${q.title}`, text: `${esc(q.text)} Reward: ${v.reward}.`, actions: q.goal.id ? [{ label: 'Show me', primary: true, fn: () => d.focus({ kind: 'building', id: q.goal.id }) }] : q.goal.ids ? [{ label: 'Show me', primary: true, fn: () => d.focus({ kind: 'building', id: q.goal.ids[0] }) }] : [], ttl: 14000 });
        hud.say(q.who, q.text);
        return true;
      }
      case 'questDone': {
        const q = d.S_().q?.list.find((x) => x.id === e.id);
        if (!q) return true;
        audio.play('objective');
        hud.dismiss('qn-' + q.id);
        hud.alert({ id: 'qd-' + q.id, level: 'good', title: `Task done: ${q.title}`, text: `Thank you! You earned ${questView(d.S_(), q, d.bal()).reward}.`, ttl: 8000 });
        
        return true;
      }
      case 'questFailed': {
        const q = d.S_().q?.list.find((x) => x.id === e.id);
        if (!q) return true;
        hud.dismiss('qn-' + q.id);
        hud.alert({ id: 'qf-' + q.id, level: 'info', title: `Missed: ${q.title}`, text: 'No harm done. There’ll be new tasks tomorrow.', ttl: 7000 });
        return true;
      }
      case 'protestOutcome':
        hud.alert({ id: 'po', level: e.ok ? 'good' : 'warn', title: e.ok ? 'Towers moved as promised' : 'The towers are still there', text: e.ok ? 'The residents are grateful.' : 'You said you would move them. People feel let down.', ttl: 8000 });
        return true;
    }
    return false;
  }

  return { handle, openChoice, reset: () => (queue.length = 0, (open = false)) };
}
