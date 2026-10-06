import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';
import { diffJson, applyJson } from '../src/sheets/store.js';
import { emptySheet, computeSheet, SHEET_FORMAT } from '@dndapp/shared/sheet.js';

/** A small text PDF: one array of lines per page. */
function makePdf(pages) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects = [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
  ];
  pages.forEach((lines, i) => {
    const content = `BT /F1 11 Tf 14 TL 72 740 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objects.push([4 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`]);
    objects.push([5 + i * 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (const [n, body] of objects) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${body}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const HEX_PAGE = [
  'CHAPTER 11 | SPELLS',
  'HEX',
  '1st-leveI enchantment',
  'Casting Time: 1 bonus action',
  'Range: 90 feet',
  'Components: V. S. M (the petrified eye of a newt)',
  'Duration: Concentration. up to 1 hour',
  'Vou place a curse on a creature that you can see within',
  'range. Until the spell ends, you deal an extra Id6',
  'necrotic damage to the target whenever you hit it.',
  'HOLD MONSTER',
  '5th-level enchantment',
  'Casting Time: 1 action',
];

const spellOut = (over) => ({
  found: true, name: 'Hex', level: 1, school: 'Enchantment', casting_time: '1 bonus action', range: '90 feet',
  components: 'V, S, M', material: 'the petrified eye of a newt', duration: 'Up to 1 hour', concentration: true, ritual: false,
  description: 'You place a curse on a creature that you can see within range.', higher_levels: '', ...over,
});

const nullBy = (keys) => Object.fromEntries(keys.map((k) => [k, null]));
const ABS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const TEXT = ['equipment', 'proficiencies_languages', 'features', 'personality', 'ideals', 'bonds', 'flaws', 'age', 'height', 'weight', 'eyes', 'skin', 'hair', 'appearance', 'allies', 'backstory', 'treasure', 'additional_features'];

/** What the AI might read off an uploaded sheet for a 3rd-level rogue in leather armour. */
const importOut = (over = {}) => ({
  readable: true,
  name: 'Thorin Oakenshield', player_name: 'Sam', race: 'Mountain Dwarf', background: 'Criminal', alignment: 'Chaotic Good', xp: '900',
  classes: [{ name: 'Rogue', subclass: 'Thief', level: 3 }],
  abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 13, cha: 8 },
  save_proficiencies: ['dex', 'int'],
  skills: [
    { skill: 'stealth', proficiency: 'expertise', bonus: 7 },
    { skill: 'perception', proficiency: 'proficient', bonus: 3 },
  ],
  printed: {
    proficiency_bonus: 2, ac: 14, initiative: 3, speed: 25, hp_max: 24, passive_perception: 13, hit_dice: '3d8',
    saves: { ...nullBy(ABS), dex: 5 }, spell_save_dc: null, spell_attack_bonus: null, spell_slots: [],
  },
  inspiration: false, hp_current: 20, hp_temp: null,
  attacks: [{ name: 'Shortsword', bonus: '+5', damage: '1d6+3 piercing', notes: '' }],
  coins: { cp: null, sp: 4, ep: null, gp: 37, pp: null },
  text: { ...nullBy(TEXT), features: 'Sneak Attack (2d6)\nCunning Action', equipment: 'Leather armour, thieves\' tools' },
  spellcasting_class: null,
  spells: [],
  notes: '',
  ...over,
});

test('diff and apply: any change to a sheet can be replayed from the changes alone', () => {
  const a = { name: 'A', list: [1, 2, 3], o: { x: 1, y: 2 }, spells: [{ n: 'a' }, { n: 'b' }] };
  const b = { name: 'B', list: [1, 5], o: { x: 1, z: 3 }, spells: [{ n: 'b', p: true }], added: [true] };
  const ops = diffJson(a, b);
  assert.deepEqual(applyJson(structuredClone(a), ops), b);
  assert.deepEqual(diffJson(b, structuredClone(b)), []);
});

test('character sheet: blank to start, saved and versioned, private, archived as changes', async () => {
  const t = await setup();
  try {
    const url = `/campaigns/${t.campaign.id}/sheet`;
    const first = (await t.request('GET', url, { as: t.sam.token })).json();
    assert.equal(first.version, 0);
    assert.equal(first.sheet.name, 'Thorin'); // the character name from the campaign
    assert.equal(first.sheet.player_name, 'Sam');

    const sheet = { ...first.sheet, classes: [{ name: 'Rogue', subclass: '', level: 3 }], abilities: { ...first.sheet.abilities, dex: 16 }, overrides: { ac: 14 } };
    const saved = await t.request('PUT', url, { as: t.sam.token, body: { sheet, version: 0 } });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().version, 1);
    const back = (await t.request('GET', url, { as: t.sam.token })).json();
    assert.equal(back.version, 1);
    assert.equal(back.sheet.overrides.ac, 14);
    assert.equal(computeSheet(back.sheet).values.ac, 14);

    // Saving without changes keeps the version; a change appends only what changed.
    assert.equal((await t.request('PUT', url, { as: t.sam.token, body: { sheet: back.sheet, version: 1 } })).json().version, 1);
    const edited = { ...back.sheet, overrides: {}, coins: { ...back.sheet.coins, gp: 12 } };
    assert.equal((await t.request('PUT', url, { as: t.sam.token, body: { sheet: edited, version: 1 } })).json().version, 2);
    const lines = fs.readFileSync(path.join(t.paths.archive, t.campaign.slug, 'character-sheets', `${t.sam.id}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0].changes[0].p, []);
    assert.deepEqual(lines[1].changes.map((c) => c.p.join('.')).sort(), ['coins.gp', 'overrides.ac']);

    // A save based on an old version is refused, with the current sheet.
    const stale = await t.request('PUT', url, { as: t.sam.token, body: { sheet: { ...edited, name: 'Old tab' }, version: 1 } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().current.version, 2);
    assert.equal(stale.json().current.sheet.coins.gp, 12);

    // Private: Alex gets their own blank sheet; outsiders and the admin login can't have one here.
    const alex = (await t.request('GET', url, { as: t.alex.token })).json();
    assert.equal(alex.version, 0);
    assert.equal(alex.sheet.name, 'Lyra');
    t.auth.removeMember(t.campaign.id, t.dm.id);
    assert.equal((await t.request('GET', url)).statusCode, 403);

    // Download, then upload the file again: no AI needed, nothing lost.
    const file = (await t.request('GET', `${url}/download`, { as: t.sam.token })).json();
    assert.equal(file.format, SHEET_FORMAT);
    const re = await t.request('POST', `${url}/import`, {
      as: t.alex.token,
      body: { filename: 'thorin.json', data: Buffer.from(JSON.stringify(file)).toString('base64') },
    });
    assert.equal(re.statusCode, 200);
    assert.equal(re.json().sheet.coins.gp, 12);
    assert.equal(t.llm.calls.length, 0);

    // An account with a sheet has history: it can be blocked, not deleted.
    assert.equal((await t.request('DELETE', `/admin/users/${t.alex.id}`)).statusCode, 409);
  } finally {
    await t.cleanup();
  }
});

test('uploading a sheet: the AI reads it; numbers on the sheet that differ from the rules are kept as the player typed them', async () => {
  const llm = createFakeLLM({ structured: async () => importOut() });
  const t = await setup({ llm });
  try {
    const url = `/campaigns/${t.campaign.id}/sheet/import`;
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(32)]);
    const res = await t.request('POST', url, { as: t.sam.token, body: { filename: 'my sheet.png', data: png.toString('base64') } });
    assert.equal(res.statusCode, 200, res.body);
    const { sheet, version } = res.json();
    assert.equal(version, 1);
    assert.equal(sheet.name, 'Thorin Oakenshield');
    assert.equal(sheet.classes[0].name, 'Rogue');
    assert.deepEqual(sheet.skills, { stealth: 'expertise', perception: 'proficient' });
    assert.equal(sheet.coins.gp, 37);
    assert.match(sheet.features, /Sneak Attack/);
    // Rules give AC 13 and HP 3d8 average 8+5+5 +2/level = 24, speed 25; the sheet says AC 14 (leather armour).
    assert.deepEqual(sheet.overrides, { ac: 14 });
    const { values } = computeSheet(sheet);
    assert.equal(values['skill.stealth'], 7);
    assert.equal(values.passive_perception, 13);

    // The picture went to the AI, and the upload is archived as uploaded.
    const call = llm.calls.at(-1);
    assert.equal(call.purpose, 'sheet:import');
    assert.equal(call.attachments[0].type, 'image');
    assert.equal(call.attachments[0].media_type, 'image/png');
    const uploads = fs.readdirSync(path.join(t.paths.archive, t.campaign.slug, 'character-sheets', 'uploads'));
    assert.equal(uploads.length, 1);
    assert.match(uploads[0], new RegExp(`^${t.sam.id}-.*my_sheet\\.png$`));

    // A PDF: its text goes in the prompt and the PDF itself is attached.
    const pdf = makePdf([['CHARACTER NAME Thorin Oakenshield', 'CLASS & LEVEL Rogue 3', 'ARMOR CLASS 14']]);
    const res2 = await t.request('POST', url, { as: t.sam.token, body: { filename: 'sheet.pdf', data: pdf.toString('base64'), version: 1 } });
    assert.equal(res2.statusCode, 200, res2.body);
    assert.match(llm.calls.at(-1).prompt, /ARMOR CLASS 14/);
    assert.equal(llm.calls.at(-1).attachments[0].media_type, 'application/pdf');

    // Files that aren't sheets are refused.
    assert.equal((await t.request('POST', url, { as: t.sam.token, body: { data: Buffer.from([0, 1, 2, 0xff, 0]).toString('base64') } })).statusCode, 400);
    llm.calls.length = 0;
  } finally {
    await t.cleanup();
  }
});

test('spell lookup: SRD first (no AI), then the books (AI tidies the scan), then the AI, with a limit per hour', async () => {
  const llm = createFakeLLM({
    structured: async ({ purpose, prompt }) => {
      if (purpose === 'spell:book') return spellOut();
      return spellOut({ found: /Booming Blade/.test(prompt), name: 'Booming Blade', level: 0, school: 'Evocation', source: 'x' });
    },
  });
  const t = await setup({ llm, config: { sheets: { aiPerHour: 2 } } });
  try {
    fs.mkdirSync(t.config.booksDir, { recursive: true });
    fs.writeFileSync(path.join(t.config.booksDir, 'Players Handbook.pdf'), makePdf([['Introduction'], HEX_PAGE]));
    const lookup = (name) => t.request('GET', `/campaigns/${t.campaign.id}/spells/lookup?name=${encodeURIComponent(name)}`, { as: t.sam.token });

    const fireball = await lookup('fireball');
    assert.equal(fireball.statusCode, 200);
    assert.equal(fireball.json().name, 'Fireball');
    assert.equal(fireball.json().source, 'srd');
    assert.equal(fireball.json().level, 3);
    assert.match(fireball.json().description, /20-foot-radius sphere/);
    assert.equal((await lookup('Magic Misile')).json().name, 'Magic Missile');
    assert.equal(llm.calls.length, 0);

    const hex = (await lookup('hex')).json();
    assert.equal(hex.source, 'book');
    assert.equal(hex.source_note, 'Players Handbook, page 2');
    assert.equal(hex.concentration, true);
    assert.match(llm.calls[0].prompt, /Vou place a curse/);
    assert.doesNotMatch(llm.calls[0].prompt, /HOLD MONSTER/); // only this spell's text
    // Remembered: asking again costs nothing.
    await lookup('Hex');
    assert.equal(llm.calls.length, 1);

    const booming = (await lookup('Booming Blade')).json();
    assert.equal(booming.source, 'ai');
    assert.match(booming.source_note, /memory/);
    assert.equal(llm.calls[1].purpose, 'spell:memory');

    // The hourly limit stops further AI calls; SRD lookups still work.
    assert.equal((await lookup('Made Up Spell')).statusCode, 429);
    assert.equal((await lookup('Shield')).statusCode, 200);

    const names = (await t.request('GET', `/campaigns/${t.campaign.id}/spells?q=he`, { as: t.sam.token })).json();
    assert.ok(names.some((n) => n.name === 'Hex' && n.source === 'book'));
    assert.ok(names.some((n) => n.name === 'Heal' && n.source === 'srd'));
  } finally {
    await t.cleanup();
  }
});

test('character sheets are restored from the archive', async () => {
  const t = await setup();
  try {
    const url = `/campaigns/${t.campaign.id}/sheet`;
    const sheet = { ...emptySheet({ name: 'Thorin' }), xp: '300', overrides: { speed: 35 } };
    await t.request('PUT', url, { as: t.sam.token, body: { sheet, version: 0 } });
    await t.request('PUT', url, { as: t.sam.token, body: { sheet: { ...sheet, xp: '900' }, version: 1 } });

    const ctx = await createContext({
      config: t.config,
      paths: { ...t.paths, db: path.join(t.dir, 'restored.sqlite') },
      llm: createFakeLLM(),
      embedder: fakeEmbedder,
      log: { error() {} },
    });
    try {
      const cid = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const restored = ctx.sheets.get(cid, t.sam.id);
      assert.equal(restored.version, 2);
      assert.equal(restored.sheet.xp, '900');
      assert.equal(restored.sheet.overrides.speed, 35);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }
  } finally {
    await t.cleanup();
  }
});
