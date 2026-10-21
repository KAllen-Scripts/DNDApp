/**
 * The DM's tools on the map: importing maps, map settings (grid, scale, variants), fog and walls,
 * tokens (adding, editing, pictures, stat blocks, records) and saving tokens to the DM's creatures.
 */
import { onGone, onMap, renderGrid, select, show, toImage } from './map.js';
import { TOKEN_COLORS, TOKEN_KINDS, TOKEN_KIND_NAMES, TOKEN_SIZES, TOKEN_SIZE_NAMES, UNITS } from './shared/map.js';
import { api, h, readBase64 } from './api.js';
import { base, downloadUvtt, report, state, status } from './map-state.js';
import { creatureList, creatureSaved } from './creatures.js';
import { markdownBox } from './markdown.js';
import { showStatBlock, statsFound } from './stat-block.js';
import { openCreator } from './map-creator.js';
import { whoField } from './map-places.js';

const $ = (sel) => document.querySelector(sel);

// ---------- the DM's tools ----------

export async function importMap(file) {
  if (file.size > 35 * 1024 * 1024) return status('That file is too big (35 MB at most).', true);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const page = isPdf ? await askPage(file.name) : null;
  if (isPdf && !page) return;
  status(isPdf ? `Uploading page ${page}…` : 'Uploading…');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const map = await api('POST', base(), { filename: file.name, data, ...(page && { page }) });
  onMap(map);
  await show(map);
}

/** Which page of a PDF has the map (1-based), or null if the DM cancels. */
function askPage(filename) {
  const dialog = $('#map-dialog');
  const page = h('input', { type: 'number', min: '1', step: '1', value: '1', required: true });
  return new Promise((resolve) => {
    let chosen = null;
    dialog.replaceChildren(
      h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
        e.preventDefault();
        chosen = Math.max(1, Math.round(Number(page.value) || 1));
        dialog.close();
      } },
        h('h2', {}, 'Which page is the map on?'),
        h('p', { class: 'muted small' }, `${filename}: the page is turned into the map's picture. The PDF is kept with it.`),
        field('Page', page),
        h('div', { class: 'map-dialog-actions' },
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
          h('button', { class: 'primary' }, 'Import'),
        ),
      ),
    );
    dialog.onclose = () => resolve(chosen);
    dialog.showModal();
    page.select();
  });
}

/** New map (the DM): import one, or make one from scratch in the map creator. */
export function newMapDialog() {
  const dialog = $('#map-dialog');
  const choice = (id, title, text, onclick) => h('button', { type: 'button', id, class: 'ghost map-choice', onclick: () => { dialog.close(); onclick(); } },
    h('strong', {}, title), h('span', { class: 'muted small' }, text));
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner' },
      h('h2', {}, 'New map'),
      choice('map-import', 'Import a map', 'A picture (PNG, JPEG, WebP), a page of a PDF, or a Universal VTT file (.dd2vtt, .uvtt) with its walls.', () => $('#map-file').click()),
      choice('map-create', 'Make a map', 'From scratch in the map creator: paint floors, draw rooms, walls and doors, and place furniture, trees and your own pictures.', () => openCreator().catch(report)),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

export const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);

/** Map settings: name, who sees it (every player or chosen ones), grid (drawn on the map while editing), scale, the AI's reading. */
export function settingsDialog() {
  const map = state.current;
  if (!map) return;
  const dialog = $('#map-dialog');
  const name = h('input', { value: map.name, maxLength: 100, required: true });
  const who = whoField({ shown: map.shown, to: map.shown_to ?? null });
  const hasGrid = h('input', { type: 'checkbox', checked: !!map.grid });
  const size = h('input', { type: 'number', min: '4', step: '0.1', value: map.grid?.size ?? Math.round(map.image.width / 20) });
  const gx = h('input', { type: 'number', step: '0.5', value: map.grid?.x ?? 0 });
  const gy = h('input', { type: 'number', step: '0.5', value: map.grid?.y ?? 0 });
  const distance = h('input', { type: 'number', min: '0', step: 'any', value: map.scale?.distance ?? '', placeholder: 'none' });
  const unit = h('select', {}, ...UNITS.map((u) => new Option(u, u)));
  unit.value = map.scale?.unit ?? 'ft';
  const per = h('select', {}, new Option('per square', 'square'), new Option('across the whole map', 'width'));
  per.value = map.scale?.per ?? (map.grid ? 'square' : 'width');
  const gridFields = h('div', { class: 'map-row' }, field('Square size (px)', size), field('Offset across', gx), field('Offset down', gy));

  const draft = () => (hasGrid.checked && Number(size.value) >= 4 ? { size: Number(size.value), x: Number(gx.value) || 0, y: Number(gy.value) || 0 } : null);
  const preview = () => {
    gridFields.hidden = !hasGrid.checked;
    state.draftGrid = draft();
    renderGrid();
  };
  for (const el of [hasGrid, size, gx, gy]) el.addEventListener('input', preview);

  // Other pictures of the same map (night, after the fire): added and removed here at once; which one shows is in the map bar.
  const variants = h('div', { class: 'map-variants' });
  const renderVariants = () => {
    const m = state.maps.find((x) => x.id === map.id) ?? map;
    variants.replaceChildren(
      ...m.variants.map((v) => h('div', { class: 'map-row' },
        h('span', {}, `${v.name}${m.variant === v.id ? ' (showing)' : ''}`),
        h('button', { type: 'button', class: 'ghost danger', 'aria-label': `Remove ${v.name}`, onclick: async () => {
          if (!confirm(`Remove the picture "${v.name}"? (It stays in the archive.)`)) return;
          try {
            const saved = await state.guarded(() => api('DELETE', `${base()}/${map.id}/variants/${v.id}`));
            if (saved) onMap(saved);
            renderVariants();
          } catch (err) {
            report(err);
          }
        } }, 'Remove'),
      )),
    );
  };
  const addVariant = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Another picture of this map' });
  addVariant.addEventListener('change', async () => {
    const file = addVariant.files[0];
    addVariant.value = '';
    if (!file) return;
    try {
      status('Uploading…');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await state.guarded(() => api('POST', `${base()}/${map.id}/variants`, { filename: file.name, data }));
      if (res) onMap(res.map);
      renderVariants();
    } catch (err) {
      report(err);
    }
  });
  renderVariants();

  const reading = map.reading;
  const aiText = [map.description, reading.notes].filter(Boolean).join('\n\n');
  const save = async () => {
    const grid = draft();
    const d = Number(distance.value);
    const scale = d > 0 && (per.value === 'width' || grid) ? { distance: d, unit: unit.value, per: per.value } : null;
    const seen = who.read();
    const saved = await api('PATCH', `${base()}/${map.id}`, { name: name.value.trim() || map.name, shown: seen.shown, shown_to: seen.to, grid, scale });
    onMap(saved);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, 'Map settings'),
      field('Name', name),
      h('h3', {}, 'Who can see this map'),
      who.el,
      h('h3', {}, 'Grid'),
      h('label', { class: 'map-check' }, hasGrid, ' This map has a grid (tokens snap to it)'),
      gridFields,
      h('p', { class: 'muted small' }, 'The grid is drawn over the map while this is open, so you can line it up.'),
      h('h3', {}, 'Scale'),
      h('div', { class: 'map-row' }, field('Distance', distance), field('Unit', unit), field('Measured', per)),
      h('h3', {}, 'Other pictures'),
      h('p', { class: 'muted small' }, 'The same map at night, after a fire, with a secret door showing… Each is stretched to fit this map, so everything stays in place. Pick which one everyone sees in the map bar.'),
      variants,
      field('Add a picture', addVariant),
      h('h3', {}, 'Other VTTs'),
      h('p', { class: 'muted small' }, 'Download the map as a Universal VTT file (.dd2vtt): its picture, grid, walls, doors and lights, for Foundry, Dungeondraft and others. Brought back here, it also keeps its heights, stairs, ladders, obstacles and secret doors. (Also in Edit map.)'),
      h('button', { type: 'button', class: 'ghost', id: 'map-export', disabled: !map.grid, title: map.grid ? '' : 'Set the grid first', onclick: () => downloadUvtt(map).catch(report) }, 'Download .dd2vtt'),
      h('h3', {}, 'What the AI saw'),
      h('p', { class: 'muted small map-ai' }, reading.status === 'pending' ? 'Reading…' : reading.status === 'failed' ? reading.error : reading.status === 'none' ? 'Not read yet. Read with the AI finds its name, grid and scale.' : aiText || 'Nothing to add.'),
      h('p', { class: 'muted small' }, 'Only you see this.'),
      h('div', { class: 'map-dialog-actions' },
        h('button', { type: 'button', class: 'ghost danger', onclick: () => removeMap(map).then(() => dialog.close()) }, 'Remove map'),
        map.designed
          ? h('button', { type: 'button', class: 'ghost', onclick: () => { dialog.close(); openCreator(map).catch(report); } }, 'Change in the map creator')
          : h('button', { type: 'button', class: 'ghost', disabled: reading.status === 'pending', onclick: () => readAgain(map).then(() => dialog.close()) }, reading.status === 'none' ? 'Read with the AI' : 'Read again with the AI'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Save'),
      ),
    ),
  );
  dialog.onclose = () => {
    state.draftGrid = undefined;
    if (state.current) renderGrid();
  };
  preview();
  dialog.showModal();
}

async function readAgain(map) {
  if (map.reading.status !== 'none' && !confirm('Read this map again with the AI? Its grid, scale and description will be replaced.')) return;
  try {
    onMap(await state.guarded(() => api('POST', `${base()}/${map.id}/read`)));
  } catch (err) {
    report(err);
  }
}

async function removeMap(map) {
  if (!confirm(`Remove "${map.name}"? Nobody will see it any more. (It stays in the archive.)`)) return;
  try {
    await state.guarded(() => api('DELETE', `${base()}/${map.id}`));
    onGone(map.id);
  } catch (err) {
    report(err);
  }
}

let players = null; // the campaign's players, fetched once for the token dialog
/** Forget them (leaving the campaign). */
export const forgetPlayers = () => { players = null; };
/** The campaign's players (fetched once): for tokens, and for who sees a map or a place. */
export async function campaignPlayers() {
  players ??= (await state.guarded(() => api('GET', `/campaigns/${state.campaignId}/members`)))?.filter((m) => m.role === 'player' && !m.revoked_at) ?? null;
  return players;
}

/** Add a token, or change one (DM). New tokens go in the middle of what's on screen. */
export async function tokenDialog(token = null) {
  const map = state.current;
  if (!map) return;
  if (!(await campaignPlayers())) return;
  const dialog = $('#map-dialog');
  // A companion or summon is asked for with its player (below), not as a kind of its own.
  const kind = h('select', {}, ...TOKEN_KINDS.filter((k) => k !== 'companion').map((k) => new Option(TOKEN_KIND_NAMES[k], k)));
  kind.value = token?.kind === 'companion' ? 'pc' : token?.kind ?? 'enemy';
  const companion = h('input', { type: 'checkbox', checked: token?.kind === 'companion' });
  const name = h('input', { value: token?.name ?? '', maxLength: 80, placeholder: 'Goblin 1' });
  const size = h('select', {}, ...TOKEN_SIZES.map((s) => new Option(`${TOKEN_SIZE_NAMES[s]} (${s === 0.5 ? '½' : s} square${s > 1 ? 's' : ''})`, s)));
  size.value = String(token?.size ?? 1);
  const color = h('input', { type: 'color', value: token?.color ?? TOKEN_COLORS[kind.value] });
  const hpMax = h('input', { type: 'number', min: '1', step: '1', value: token?.hp?.max ?? '', placeholder: 'unknown' });
  // A player character with a saved sheet has the sheet's hit points.
  if (token?.hp_sheet) Object.assign(hpMax, { disabled: true, title: 'From the player’s character sheet' });
  const hidden = h('input', { type: 'checkbox', checked: !!token?.hidden });
  const darkvision = h('input', { type: 'number', min: '0', step: '5', value: token?.darkvision || '', placeholder: 'none' });

  // "Who is it?": one list for everyone a token can stand for, so the dialog
  // asks it once. A player ("p:id"), one of the DM's saved creatures ("c:id",
  // new tokens only: picking one goes to placing it), or someone from the
  // campaign's records, what the archivist has written down ("r:id"). It shows
  // only those of the Kind picked, and a search box narrows it (owner,
  // 2026-10-20: "the list still shows all… it'll get large quickly").
  const { records } = (await state.guarded(() => api('GET', `${base()}/records`))) ?? { records: [] };
  const saved = token ? [] : creatureList().filter((c) => !c.finding);
  // Someone from the records is an NPC, unless the archivist files them as a monster or a foe.
  const foe = (r) => /monster|creature|enem|villain|beast|foe/i.test(r.kind);
  const linked = token?.record && !records.some((r) => r.id === token.record.id) ? [{ id: token.record.id, title: token.record.title, kind: '', person: true }] : [];
  const everyRecord = [...records, ...linked];
  const entry = (value, label, extra = {}) => ({ value, label, ...extra });
  const entries = {
    p: players.map((p) => entry(`p:${p.id}`, `${p.character_name || p.name} (${p.name})`)),
    c: saved.map((c) => entry(`c:${c.id}`, `${c.name} (${c.kind === 'npc' ? 'NPC' : 'enemy'})`, { kind: c.kind === 'npc' ? 'npc' : 'enemy' })),
    r: everyRecord.map((r) => entry(`r:${r.id}`, `${r.title}${r.person ? '' : ` (${r.kind})`}`, { kind: foe(r) ? 'enemy' : 'npc', person: !!r.person })),
  };
  let chosen = token?.user_id ? `p:${token.user_id}` : token?.record ? `r:${token.record.id}` : '';
  const picked = () => {
    const [type, id] = chosen.split(':');
    return { type: type || null, id: id ? Number(id) || id : null };
  };
  const search = h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search for who it is', autocomplete: 'off' });
  const list = h('div', { class: 'who-list', role: 'listbox', 'aria-label': 'Who is it?' });
  // What the Kind picked offers: players for a player character; else your creatures and the records of that kind
  // (places and things from the records only when searched for, as they're rarely tokens).
  const groupsFor = (k, query) => {
    const q = query.trim().toLowerCase();
    const match = (e) => !q || e.label.toLowerCase().includes(q);
    if (k === 'pc') return [['Players', entries.p.filter(match)]];
    return [
      ['Your creatures', entries.c.filter((e) => e.kind === k && match(e))],
      ["In the campaign's records", entries.r.filter((e) => e.person && e.kind === k && match(e))],
      ['Other things in the records', q ? entries.r.filter((e) => !e.person && match(e)) : []],
    ];
  };
  const renderList = () => {
    const groups = groupsFor(kind.value, search.value).filter(([, items]) => items.length);
    const option = (value, label) => h('button', {
      type: 'button', role: 'option', class: 'who-option', 'data-value': value, 'aria-selected': String(chosen === value),
      onclick: () => choose(value),
    }, label);
    const none = token ? 'Nobody in particular' : 'Someone new';
    list.replaceChildren(...[
      option('', none),
      ...groups.map(([label, items]) => h('div', { class: 'who-group', role: 'group', 'aria-label': label },
        h('div', { class: 'who-group-name muted small' }, label), ...items.map((e) => option(e.value, e.label)))),
      search.value.trim() && !groups.length ? h('p', { class: 'muted small who-none' }, `No ${kind.value === 'pc' ? 'player' : TOKEN_KIND_NAMES[kind.value]} called "${search.value.trim()}". Add them as someone new.`) : null,
    ].filter(Boolean));
  };
  const lookUp = h('input', { type: 'checkbox', checked: true });
  const lookUpField = h('label', { class: 'map-check' }, lookUp, ' Fill in its stat block, hit points and size with the AI');
  let colorTouched = !!token;
  color.addEventListener('input', () => (colorTouched = true));
  const kindField = field('Kind', kind);
  // A player's token is their character, or a companion or summon they control (a familiar, a druid's wolf).
  const companionField = h('label', { class: 'map-check', title: 'They move it, track its hit points and roll for it from its stat block' }, companion, ' A companion or summon of theirs, not their character');
  const isCompanion = () => picked().type === 'p' && companion.checked;
  const sync = () => {
    companionField.hidden = picked().type !== 'p';
    lookUpField.hidden = !!token || (kind.value !== 'enemy' && !isCompanion());
    if (!colorTouched) color.value = TOKEN_COLORS[isCompanion() ? 'companion' : kind.value];
    renderList();
  };
  // Who it is, picked from the list.
  const choose = (value) => {
    chosen = value;
    const { type, id } = picked();
    if (type === 'c') {
      const c = saved.find((x) => x.id === id || String(x.id) === String(id));
      if (c) placeDialog(c);
      return;
    }
    if (type === 'p') {
      const p = players.find((x) => x.id === id);
      // Named after their character unless something else is typed.
      if (p && !name.value.trim() && !companion.checked) name.value = p.character_name || p.name;
    } else if (type === 'r') {
      const r = everyRecord.find((x) => x.id === id);
      if (r && (!token || !name.value.trim())) name.value = r.title.slice(0, 80);
    }
    sync();
  };
  // Another kind: the list shows those, and whoever was picked goes if they aren't one.
  kind.addEventListener('change', () => {
    const { type } = picked();
    const stillThere = groupsFor(kind.value, '').some(([, items]) => items.some((e) => e.value === chosen));
    if (type && !stillThere && !(type === 'r' && token)) chosen = '';
    sync();
  });
  companion.addEventListener('change', sync);
  search.addEventListener('input', renderList);
  // Enter in the search box picks the only (or first) match rather than adding the token.
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    list.querySelector('.who-group .who-option')?.click();
  });
  sync();

  const save = async () => {
    const { type, id } = picked();
    const body = {
      kind: type === 'p' ? (companion.checked ? 'companion' : 'pc') : kind.value,
      name: name.value.trim(),
      user_id: type === 'p' ? id : null,
      size: Number(size.value),
      color: color.value,
      hidden: hidden.checked,
      darkvision: Math.max(0, Number(darkvision.value) || 0),
    };
    // Picking a player keeps whatever record the token was already linked to.
    const recordId = type === 'r' ? id : type === 'p' ? token?.record?.id ?? null : null;
    if (recordId !== (token?.record?.id ?? null)) body.record = recordId ? { id: recordId } : null;
    const max = Number(hpMax.value) > 0 ? Math.round(Number(hpMax.value)) : null;
    if (!token?.hp_sheet && max !== (token?.hp?.max ?? null)) {
      // A new maximum: keep the damage taken so far, or start at full.
      const taken = token?.hp?.max && token.hp.current != null ? token.hp.max - token.hp.current : 0;
      body.hp = max ? { current: max - taken, max } : null;
    }
    if (token) {
      onMap((await api('PATCH', `${base()}/${map.id}/tokens/${token.id}`, body)).map);
    } else {
      const box = $('#map-view').getBoundingClientRect();
      const middle = toImage(box.left + box.width / 2, box.top + box.height / 2);
      const res = await api('POST', `${base()}/${map.id}/tokens`, { ...body, ...middle });
      onMap(res.map);
      select(res.token.id);
      if ((body.kind === 'enemy' || body.kind === 'companion') && lookUp.checked && body.name) fillStats(res.token);
    }
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, token ? 'Change token' : 'Add a token'),
      kindField,
      h('div', { class: 'map-field who-field' }, h('span', {}, 'Who is it?'), search, list),
      companionField,
      field('Name', name),
      h('div', { class: 'map-row' }, field('Size', size), field('Colour', color), field('Max HP', hpMax), field(`Darkvision (${map.scale?.unit ?? 'ft'})`, darkvision)),
      h('label', { class: 'map-check' }, hidden, ' Hidden from players (an ambush, someone lurking)'),
      lookUpField,
      token ? null : h('p', { class: 'muted small' }, 'It appears in the middle of what you can see; drag it into place.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, token ? 'Save' : 'Add'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

/**
 * Put one of the DM's creatures on the map on screen (from the Creatures tab
 * or Add token): how many, and whether hidden. They appear in a row in the
 * middle of what's on screen, numbered when there are several.
 */
export function placeCreature(c) {
  document.querySelector('[data-tab=map]').click();
  if (!state.current) return status('Import a map first, then place your creatures on it.', true);
  placeDialog(c);
}

function placeDialog(c) {
  const map = state.current;
  const dialog = $('#map-dialog');
  const count = h('input', { name: 'count', type: 'number', min: '1', max: '20', step: '1', value: '1' });
  const hidden = h('input', { type: 'checkbox' });
  const place = async () => {
    const box = $('#map-view').getBoundingClientRect();
    const middle = toImage(box.left + box.width / 2, box.top + box.height / 2);
    const n = Math.min(20, Math.max(1, Math.round(Number(count.value)) || 1));
    const res = await api('POST', `${base()}/${map.id}/creatures/${c.id}`, { count: n, hidden: hidden.checked, ...middle });
    onMap(res.map);
    select(res.tokens[0]?.id ?? null);
    status(n > 1 ? `${res.tokens.map((t) => t.name).join(', ')} are on the map.` : `${res.tokens[0].name} is on the map.`);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(place).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, `Place ${c.name}`),
      h('p', { class: 'muted small' }, [c.kind === 'npc' ? 'Friendly NPC' : 'Enemy', TOKEN_SIZE_NAMES[c.size], c.hp_max ? `${c.hp_max} HP` : '', c.stats ? 'with its stat block' : '', c.picture ? 'and picture' : ''].filter(Boolean).join(' · ')),
      field('How many', count),
      h('label', { class: 'map-check' }, hidden, ' Hidden from players (an ambush, someone lurking)'),
      h('p', { class: 'muted small' }, 'They appear in a row in the middle of what you can see, numbered if there are several; drag them into place.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Place')),
    ),
  );
  dialog.onclose = null;
  if (!dialog.open) dialog.showModal();
  count.select?.();
}

/** Put one of the DM's merchants on the map on screen (from the Merchants tab), in the middle of what's showing. */
export async function placeMerchant(m) {
  document.querySelector('[data-tab=map]').click();
  if (!state.current) return status('Import a map first, then place your merchants on it.', true);
  try {
    const box = $('#map-view').getBoundingClientRect();
    const middle = toImage(box.left + box.width / 2, box.top + box.height / 2);
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/merchants/${m.id}`, middle));
    if (!res) return;
    onMap(res.map);
    select(res.token.id);
    status(`${m.name} is on the map. Players open the shop from the token.`);
  } catch (err) {
    report(err);
  }
}

/** Keep a token from the map in the DM's creatures. */
export async function saveCreature(token) {
  try {
    const res = await state.guarded(() => api('POST', `/campaigns/${state.campaignId}/creatures`, { from: { map_id: state.current.id, token_id: token.id } }));
    if (!res) return;
    creatureSaved(res);
    status(`${res.name} is in your creatures now (the Creatures tab).`);
  } catch (err) {
    report(err);
  }
}

/** What the campaign's records say about the person a token stands for (DM only). */
export async function recordDialog(token) {
  try {
    const r = await state.guarded(() => api('GET', `${base()}/records/${token.record.id}?title=${encodeURIComponent(token.record.title)}`));
    if (!r) return;
    const dialog = $('#map-dialog');
    const body = markdownBox(r.body || '_Nothing written down yet._', { class: 'a stat-text' });
    const data = Object.keys(r.data ?? {}).length ? h('pre', { class: 'small' }, JSON.stringify(r.data, null, 2)) : null;
    dialog.replaceChildren(
      h('form', { method: 'dialog', class: 'map-dialog-inner' },
        h('h2', {}, r.title),
        h('p', { class: 'muted small' }, [r.kind, r.status, ...(r.tags ?? [])].filter(Boolean).join(' · ')),
        body,
        data,
        h('p', { class: 'muted small' }, 'From the archivist, as the campaign has it now. Only you see this.'),
        h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close')),
      ),
    );
    dialog.onclose = null;
    dialog.showModal();
  } catch (err) {
    report(err);
  }
}

/** Ask the AI for a creature's stat block (DM). Hit points and size come with it unless already set. */
/** The DM picks a picture for an NPC or enemy token; tokens with the same name can share it. */
export function chooseTokenPicture(token) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return status('That picture is too big (10 MB at most).', true);
    const twins = state.current.tokens.filter((t) => t.id !== token.id && t.kind !== 'pc' && t.name.toLowerCase() === token.name.toLowerCase()).length;
    const same_name = twins > 0 && confirm(`Use this picture for all ${twins + 1} tokens named "${token.name}" on this map?`);
    try {
      status('Uploading…');
      const data = await readBase64(file);
      const res = await state.guarded(() => api('PUT', `${base()}/${state.current.id}/tokens/${token.id}/picture`, { filename: file.name, data, same_name }));
      if (!res) return;
      onMap(res.map);
      status(`${token.name} has a picture now.`);
    } catch (err) {
      report(err);
    }
  });
  document.body.append(input);
  input.click();
}

export async function removeTokenPicture(token) {
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${state.current.id}/tokens/${token.id}/picture`));
    if (res) onMap(res.map);
  } catch (err) {
    report(err);
  }
}

export async function fillStats(token, name) {
  status(`Looking up ${name ?? token.name}…`);
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/tokens/${token.id}/stats`, name ? { name } : {}));
    if (!res) return;
    onMap(res.map);
    status(statsFound(res.token.name, res.token.stats));
  } catch (err) {
    report(err);
  }
}

/** A token's stat block (the DM's, or a player's own companion's), with a way to look up a different creature. */
export const statsDialog = (token) => showStatBlock($('#map-dialog'), { title: token.name, stats: token.stats, onLookup: (name) => fillStats(token, name), shared: token.kind === 'companion' && token.user_id != null });

export async function removeToken(token) {
  if (!confirm(`Remove ${token.name} from the map?`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${state.current.id}/tokens/${token.id}`));
    if (res) onMap(res.map);
    select(null);
  } catch (err) {
    report(err);
  }
}
