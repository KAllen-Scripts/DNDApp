/**
 * The example campaign (owner, 2026-10-28: test data while there's no group yet), seeded into the example data
 * folder (config.dataSet 'example'). Everything goes through the app's own API (in-process, app.inject), so the
 * server's rules check it and it's archived like anything a DM makes. No AI calls: stat blocks, items and wiki
 * pages are written out in example/campaign, spells and Wild Shape forms come from the SRD.
 *
 * Only setup is made here: accounts, settings, sheets, creatures, items, merchants, maps and the wiki. Nothing
 * that happens in play: sessions exist only as the transcripts in example/transcripts, uploaded by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addToInventory, normalizeInventory } from '@dndapp/shared/gear.js';
import { classKey } from '@dndapp/shared/sheet.js';
import { paintRegionMap, SQUARE } from './region-map.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLE_DIR = path.resolve(here, '../../../../example');

const load = async (name) => import(new URL(`file://${path.join(EXAMPLE_DIR, 'campaign', name)}`).href);

/** Is the example campaign there already? */
export const isSeeded = (ctx, name) => !!ctx.db.prepare('SELECT 1 FROM campaigns WHERE name = ?').get(name);

/**
 * Seed the example campaign. `password` is every test account's. `pictures`: the folder of pictures
 * (example/pictures); missing files are skipped. Returns { campaign, accounts } and logs each step to `log`.
 */
export async function seedExample(ctx, app, { password, pictures = path.join(EXAMPLE_DIR, 'pictures'), log = () => {} } = {}) {
  const { CAMPAIGN, ADMIN, ACCOUNTS, SETTINGS, GLOSSARY } = await load('campaign.js');
  const { SHEETS, SPARE, SHEET_SHARE } = await load('sheets.js');
  const { CREATURES } = await load('creatures.js');
  const { ITEMS } = await load('items.js');
  const { MERCHANTS } = await load('merchants.js');
  const { REGION, MAPS } = await load('maps.js');
  const { WORLD } = await load('wiki-world.js');
  const { PEOPLE } = await load('wiki-people.js');
  const { PLOT } = await load('wiki-plot.js');
  if (isSeeded(ctx, CAMPAIGN)) throw new Error(`The example campaign "${CAMPAIGN}" is there already.`);
  if (!password || password.length < 8) throw new Error('The example accounts need a password of at least 8 characters.');

  // ---------- accounts and the campaign ----------
  log('Accounts and the campaign');
  if (!ctx.db.prepare('SELECT 1 FROM users WHERE name = ?').get(ADMIN)) await ctx.auth.createUser(ADMIN, { password, isAdmin: true });
  const campaign = ctx.store.createCampaign(CAMPAIGN);
  const cid = campaign.id;
  const people = {};
  for (const a of ACCOUNTS) {
    const user = await ctx.auth.createUser(a.name, { password });
    ctx.auth.addMember(cid, user.id, a.role, a.character ?? null);
    const { token } = await ctx.auth.login(a.name, password);
    people[a.key] = { ...a, id: user.id, token };
  }
  const dm = people[ACCOUNTS.find((a) => a.role === 'dm').key];
  const who = (available) => (Array.isArray(available) ? available.map((k) => people[k].id) : available);

  /** One API call as someone (the DM by default); throws with the server's message on an error. */
  const call = async (method, url, body, as = dm) => {
    const res = await app.inject({ method, url: `/campaigns/${cid}${url}`, payload: body, headers: { authorization: `Bearer ${as.token}` } });
    if (res.statusCode >= 400) throw new Error(`${method} ${url}: ${res.statusCode} ${res.body.slice(0, 500)}`);
    return res.body ? res.json() : null;
  };
  const picture = (file) => {
    const p = file && path.join(pictures, file);
    return p && fs.existsSync(p) ? { filename: file, data: fs.readFileSync(p).toString('base64') } : undefined;
  };

  // ---------- settings ----------
  log('Settings, calendar and glossary');
  await call('PATCH', '/settings', SETTINGS);
  await call('PUT', '/glossary', GLOSSARY.map((g) => ({ note: '', ...g })));

  // ---------- items, creatures, merchants ----------
  log('Items');
  const itemIds = {};
  const addItem = async ({ picture: file, ...item }) => {
    const made = await call('POST', '/items', { ...item, ...(picture(file) && { picture: picture(file) }) });
    itemIds[item.name] = made.id;
  };
  for (const item of ITEMS) await addItem(item);
  log('Creatures');
  for (const { picture: file, ac: _ac, ...c } of CREATURES) await call('POST', '/creatures', { ...c, ...(picture(file) && { picture: picture(file) }) });
  log('Merchants');
  const merchantIds = {};
  for (const { stock, items = [], picture: file, map: _map, at: _at, ...m } of MERCHANTS) {
    for (const item of items) await addItem(item);
    const made = await call('POST', '/merchants', { ...m, ...(picture(file) && { picture: picture(file) }) });
    merchantIds[m.name] = made.id;
    for (const line of stock) {
      if (!itemIds[line.item]) throw new Error(`${m.name} sells "${line.item}", which isn't an item.`);
      await call('POST', `/merchants/${made.id}/stock`, { item: itemIds[line.item], qty: line.qty, full: line.qty, ...(line.price != null && { price: Math.round(line.price * 100) }) });
    }
  }

  // ---------- character sheets ----------
  log('Character sheets');
  // Spells and forms come from the SRD; one it doesn't have is kept by name rather than asking the AI.
  const noAi = () => {
    throw new Error('No AI while seeding');
  };
  const makeSheet = async (spec) => {
    const { gear = [], spells = [], forms = [], ...fields } = spec;
    const key = classKey(spec.classes[0]?.name);
    let inventory = [];
    for (const g of gear) {
      const { equip = 0, qty = 1, ...item } = g;
      inventory = addToInventory(inventory, { kind: 'other', ...item }, qty, { classKey: key });
      if (equip) inventory.at(-1).equipped = equip;
    }
    const sheet = { ...fields, inventory: normalizeInventory(inventory) };
    sheet.spells = [];
    for (const s of spells) {
      const found = await ctx.spells.lookup(s.name, { beforeAi: noAi }).catch(() => null);
      sheet.spells.push({ ...(found ?? { name: s.name, source: 'manual' }), prepared: !!s.prepared });
    }
    if (forms.length) {
      const list = [];
      for (const f of forms) {
        const found = await ctx.forms.lookup(f, { beforeAi: noAi }).catch(() => null);
        if (found) list.push(found);
      }
      sheet.wild_shape = { forms: list, active: null };
    }
    return sheet;
  };
  for (const [key, spec] of Object.entries(SHEETS)) {
    await call('PUT', '/sheet', { sheet: await makeSheet(spec), version: 0 }, people[key]);
  }
  // A second character for one player, saved and then put aside.
  {
    const p = people[SPARE.key];
    const made = await call('POST', '/characters', { name: SPARE.sheet.name, active: true }, p);
    await call('PUT', '/sheet', { sheet: await makeSheet(SPARE.sheet), version: made.sheet.version, character: made.number }, p);
    await call('POST', '/characters/1/active', {}, p);
  }

  // ---------- the wiki ----------
  log('Wiki pictures');
  const pictureIds = {};
  const wikiPicture = async (file) => {
    if (!file) return null;
    if (!(file in pictureIds)) {
      const pic = picture(file);
      pictureIds[file] = pic ? (await call('POST', '/wiki/pictures', pic)).picture.id : null;
    }
    return pictureIds[file];
  };
  log('Wiki pages');
  const pageIds = {};
  for (const page of [...WORLD, ...PEOPLE, ...PLOT]) {
    const { picture: file, banner, parent, available = 'dm', sections = [], facts = [], events = [], ...rest } = page;
    const pic = await wikiPicture(file);
    const ban = await wikiPicture(banner);
    if (parent && !pageIds[parent]) throw new Error(`The wiki page "${page.title}" is inside "${parent}", which comes later or doesn't exist.`);
    const body = {
      ...rest,
      available: who(available),
      parent: parent ? pageIds[parent] : null,
      sections: sections.map((s) => ({ ...s, available: who(s.available ?? 'all') })),
      facts: facts.map((f) => ({ ...f, ...(f.available && { available: who(f.available) }) })),
      events: events.map((e) => ({ ...e, ...(e.available && { available: who(e.available) }) })),
      ...(pic && { picture: { id: pic } }),
      ...(ban && { banner: { id: ban } }),
    };
    pageIds[page.title] = (await call('POST', '/wiki', body)).page.id;
  }
  log('Character pages');
  for (const a of ACCOUNTS.filter((x) => x.role === 'player')) {
    const { page } = await call('POST', '/wiki/characters', { player: people[a.key].id });
    pageIds[page.title] = page.id;
    await call('PUT', `/wiki/${page.id}/sheet-share`, { share: SHEET_SHARE });
  }

  // ---------- maps ----------
  log('The region map');
  const mapIds = {};
  const sq = (map, [x, y]) => [x * map.grid.size + (map.grid.x ?? 0), y * map.grid.size + (map.grid.y ?? 0)];
  {
    const png = paintRegionMap({ cols: REGION.cols, rows: REGION.rows });
    const made = await call('POST', '/maps', { filename: 'greyhallow-coast.png', data: png.toString('base64'), name: REGION.name });
    await call('PATCH', `/maps/${made.id}`, { kind: REGION.kind, grid: { size: SQUARE, x: 0, y: 0 }, scale: REGION.scale });
    mapIds[REGION.key] = made.id;
  }
  log('Made maps');
  for (const spec of MAPS) {
    const map = await makeDesignMap(spec);
    mapIds[spec.key] = map.id;
    for (const level of spec.levels ?? []) {
      let lv = await call('POST', `/maps/${map.id}/levels`, { n: level.n, start: level.start, name: level.name });
      if (level.generate) {
        const { design } = await call('POST', '/maps/design/generate', { ...level.generate, cols: map.design?.cols ?? undefined, rows: map.design?.rows ?? undefined });
        lv = await call('PUT', `/maps/${lv.id}/design`, { design });
      }
      mapIds[level.key] = lv.id;
      await setUp(lv, level);
    }
    await setUp(await call('GET', `/maps/${map.id}`), spec);
  }
  /** A starting map from the creator, saved with its look. */
  async function makeDesignMap(spec) {
    const sizes = await call('GET', '/maps/design/kinds');
    const kind = sizes.kinds.find((k) => k.key === spec.generate.kind);
    const { design } = await call('POST', '/maps/design/generate', { kind: spec.generate.kind, seed: spec.generate.seed, cols: kind.cols, rows: kind.rows });
    if (spec.look) design.look = { ...design.look, mood: spec.look };
    const made = await call('POST', '/maps/design', { name: spec.name, design });
    await call('PATCH', `/maps/${made.id}`, { kind: spec.kind });
    return { ...made, design: { cols: kind.cols, rows: kind.rows } };
  }
  /** Fog with line of sight, a light, a secret door, difficult terrain. */
  async function setUp(map, spec) {
    await call('PATCH', `/maps/${map.id}/fog`, { enabled: true, sight: true });
    if (spec.light) {
      const [x, y] = sq(map, [spec.light.x, spec.light.y]);
      await call('PATCH', `/maps/${map.id}/lights`, { add: { x, y, bright: spec.light.bright, dim: spec.light.dim } });
    }
    if (spec.secret) {
      const door = (await call('GET', `/maps/${map.id}`)).walls?.find((w) => w.door);
      if (door) await call('PATCH', `/maps/${map.id}/walls`, { secret: door.id });
    }
    if (spec.terrain) await call('PATCH', `/maps/${map.id}/terrain`, { add: { points: spec.terrain.map((p) => sq(map, p)) } });
  }

  log('Links, places and roads');
  const mapNow = (key) => call('GET', `/maps/${mapIds[key]}`);
  for (const spec of [...MAPS, ...MAPS.flatMap((m) => m.levels ?? [])]) {
    if (!spec.link) continue;
    const map = await mapNow(spec.key);
    const [x, y] = sq(map, [spec.link.x, spec.link.y]);
    await call('PATCH', `/maps/${map.id}/links`, { add: { x, y, to: mapIds[spec.link.to], label: spec.link.label } });
  }
  for (const spec of [REGION, ...MAPS]) {
    if (!spec.places?.length) continue;
    const map = await mapNow(spec.key);
    for (const p of spec.places) {
      const [x, y] = sq(map, [p.x, p.y]);
      if (p.page && !pageIds[p.page]) throw new Error(`The place "${p.name}" links to the wiki page "${p.page}", which isn't there.`);
      await call('PATCH', `/maps/${map.id}/places`, {
        add: {
          name: p.name, x, y, revealed: !!p.revealed,
          ...(p.to && { to: mapIds[p.to] }),
          ...(p.page && { page: { id: pageIds[p.page] } }),
          ...(p.points && { points: p.points.map((q) => sq(map, q)) }),
          ...(p.encounters && { encounters: p.encounters }),
        },
      });
    }
  }
  {
    const map = await mapNow(REGION.key);
    for (const road of REGION.roads) {
      for (let i = 1; i < road.points.length; i++) {
        const [x1, y1] = sq(map, road.points[i - 1]);
        const [x2, y2] = sq(map, road.points[i]);
        await call('PATCH', `/maps/${map.id}/roads`, { add: { kind: road.kind, x1, y1, x2, y2 } });
      }
    }
  }
  log('Merchants on the maps');
  for (const m of MERCHANTS) {
    if (!m.map) continue;
    const map = await mapNow(m.map);
    const [x, y] = sq(map, m.at);
    await call('POST', `/maps/${map.id}/merchants/${merchantIds[m.name]}`, { x, y });
  }

  log('Done');
  return { campaign, accounts: [ADMIN, ...ACCOUNTS.map((a) => a.name)] };
}
