/**
 * The DM's tools on the map: importing maps, map settings (grid, scale, variants), fog and walls,
 * tokens (adding, editing, pictures, stat blocks, records) and saving tokens to the DM's creatures.
 */
import { onGone, onMap, renderGrid, select, show, toImage } from './map.js';
import { TOKEN_COLORS, TOKEN_KINDS, TOKEN_KIND_NAMES, TOKEN_SIZES, TOKEN_SIZE_NAMES, UNITS } from './shared/map.js';
import { api, h, readBase64 } from './api.js';
import { base, report, state, status } from './map-state.js';
import { creatureList, creatureSaved } from './creatures.js';
import { markdownBox } from './markdown.js';
import { showStatBlock, statsFound } from './stat-block.js';

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

export const field = (label, input) => h('label', { class: 'map-field' }, h('span', {}, label), input);

/** Map settings: name, shown to players, grid (drawn on the map while editing), scale, the AI's reading. */
export function settingsDialog() {
  const map = state.current;
  if (!map) return;
  const dialog = $('#map-dialog');
  const name = h('input', { value: map.name, maxLength: 100, required: true });
  const shown = h('input', { type: 'checkbox', checked: map.shown });
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
    const saved = await api('PATCH', `${base()}/${map.id}`, { name: name.value.trim() || map.name, shown: shown.checked, grid, scale });
    onMap(saved);
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, 'Map settings'),
      field('Name', name),
      h('label', { class: 'map-check' }, shown, ' Players can see this map'),
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
      h('h3', {}, 'What the AI saw'),
      h('p', { class: 'muted small map-ai' }, reading.status === 'pending' ? 'Reading…' : reading.status === 'failed' ? reading.error : aiText || 'Nothing to add.'),
      h('p', { class: 'muted small' }, 'Only you see this.'),
      h('div', { class: 'map-dialog-actions' },
        h('button', { type: 'button', class: 'ghost danger', onclick: () => removeMap(map).then(() => dialog.close()) }, 'Remove map'),
        h('button', { type: 'button', class: 'ghost', disabled: reading.status === 'pending', onclick: () => readAgain(map).then(() => dialog.close()) }, 'Read again with the AI'),
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
  if (!confirm('Read this map again with the AI? Its grid, scale and description will be replaced.')) return;
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

/** Add a token, or change one (DM). New tokens go in the middle of what's on screen. */
export async function tokenDialog(token = null) {
  const map = state.current;
  if (!map) return;
  players ??= (await state.guarded(() => api('GET', `/campaigns/${state.campaignId}/members`))).filter((m) => m.role === 'player' && !m.revoked_at);
  const dialog = $('#map-dialog');
  const kind = h('select', {}, ...TOKEN_KINDS.map((k) => new Option(TOKEN_KIND_NAMES[k], k)));
  kind.value = token?.kind ?? 'enemy';
  const player = h('select', {}, new Option('Nobody (the DM moves it)', ''), ...players.map((p) => new Option(`${p.character_name || p.name} (${p.name})`, p.id)));
  player.value = token?.user_id ?? '';
  const name = h('input', { value: token?.name ?? '', maxLength: 80, placeholder: 'Goblin 1' });
  const size = h('select', {}, ...TOKEN_SIZES.map((s) => new Option(`${TOKEN_SIZE_NAMES[s]} (${s === 0.5 ? '½' : s} square${s > 1 ? 's' : ''})`, s)));
  size.value = String(token?.size ?? 1);
  const color = h('input', { type: 'color', value: token?.color ?? TOKEN_COLORS[kind.value] });
  const hpMax = h('input', { type: 'number', min: '1', step: '1', value: token?.hp?.max ?? '', placeholder: 'unknown' });
  const hidden = h('input', { type: 'checkbox', checked: !!token?.hidden });
  const darkvision = h('input', { type: 'number', min: '0', step: '5', value: token?.darkvision || '', placeholder: 'none' });
  // Someone from the campaign's records (what the archivist has written down about them).
  const { records } = (await state.guarded(() => api('GET', `${base()}/records`))) ?? { records: [] };
  const recordOption = (r) => new Option(`${r.title}${r.person ? '' : ` (${r.kind})`}`, r.id);
  const record = h('select', {}, new Option('Nobody in particular', ''),
    h('optgroup', { label: 'People and creatures' }, ...records.filter((r) => r.person).map(recordOption)),
    h('optgroup', { label: 'Everything else' }, ...records.filter((r) => !r.person).map(recordOption)));
  if (token?.record && !records.some((r) => r.id === token.record.id)) record.append(new Option(token.record.title, token.record.id));
  record.value = token?.record?.id ?? '';
  const recordField = field("From the campaign's records", record);
  recordField.hidden = !records.length && !token?.record;
  record.addEventListener('change', () => {
    const r = records.find((x) => String(x.id) === record.value);
    if (!r) return;
    if (!token || !name.value.trim()) name.value = r.title.slice(0, 80);
    // Someone from the records is an NPC, unless the archivist files them as a monster or a foe.
    if (!token) kind.value = /monster|creature|enem|villain|beast|foe/i.test(r.kind) ? 'enemy' : 'npc';
    sync();
  });
  // One of the DM's saved creatures instead (the Creatures tab).
  const saved = token ? [] : creatureList().filter((c) => !c.finding);
  const fromLibrary = h('select', {}, new Option('Make a new one here', ''), ...saved.map((c) => new Option(`${c.name} (${c.kind === 'npc' ? 'NPC' : 'enemy'})`, c.id)));
  fromLibrary.addEventListener('change', () => {
    const c = saved.find((x) => x.id === fromLibrary.value);
    if (c) placeDialog(c);
  });
  const libraryField = saved.length ? field('From your creatures', fromLibrary) : null;
  const lookUp = h('input', { type: 'checkbox', checked: true });
  const lookUpField = h('label', { class: 'map-check' }, lookUp, ' Fill in its stat block, hit points and size with the AI');
  let colorTouched = !!token;
  color.addEventListener('input', () => (colorTouched = true));
  const playerField = field('Player', player);
  const sync = () => {
    playerField.hidden = kind.value !== 'pc';
    lookUpField.hidden = !!token || kind.value !== 'enemy';
    if (!colorTouched) color.value = TOKEN_COLORS[kind.value];
  };
  kind.addEventListener('change', sync);
  // A player's token is named after their character unless something else is typed.
  player.addEventListener('change', () => {
    const p = players.find((x) => String(x.id) === player.value);
    if (p && !name.value.trim()) name.value = p.character_name || p.name;
  });
  sync();

  const save = async () => {
    const body = {
      kind: kind.value,
      name: name.value.trim(),
      user_id: kind.value === 'pc' && player.value ? Number(player.value) : null,
      size: Number(size.value),
      color: color.value,
      hidden: hidden.checked,
      darkvision: Math.max(0, Number(darkvision.value) || 0),
    };
    if (record.value !== String(token?.record?.id ?? '')) body.record = record.value ? { id: Number(record.value) } : null;
    const max = Number(hpMax.value) > 0 ? Math.round(Number(hpMax.value)) : null;
    if (max !== (token?.hp?.max ?? null)) {
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
      if (kind.value === 'enemy' && lookUp.checked && body.name) fillStats(res.token);
    }
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, token ? 'Change token' : 'Add a token'),
      libraryField,
      recordField,
      field('Kind', kind),
      playerField,
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
    status(statsFound(res.token.name, res.token.stats.name));
  } catch (err) {
    report(err);
  }
}

/** A token's stat block (DM only), with a way to look up a different creature. */
export const statsDialog = (token) => showStatBlock($('#map-dialog'), { title: token.name, stats: token.stats, onLookup: (name) => fillStats(token, name) });

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
