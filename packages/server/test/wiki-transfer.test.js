/**
 * Moving the wiki in and out (wiki space stage 9b): an Obsidian vault imports with its links, pictures and folders;
 * the export imports back; a player's export has nothing hidden in it; messy notes and a Word file go to the AI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { setup, terrain, createFakeLLM } from './helpers.js';
import { frontMatter } from '../src/wiki/transfer.js';

const zip = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])))).toString('base64');

test('wiki import: front matter', () => {
  const { meta, body } = frontMatter('---\ntitle: "The Vale"\ntags: [a, "b"]\naliases:\n  - Old Vale\n  - The Dale\nRuler: "[[Mira]]"\n---\nText');
  assert.deepEqual(meta, { title: 'The Vale', tags: ['a', 'b'], aliases: ['Old Vale', 'The Dale'], ruler: '[[Mira]]' });
  assert.equal(body, 'Text');
  assert.deepEqual(frontMatter('No front matter').meta, {});
});

test('wiki import: an Obsidian vault, then the export round trip and a player\'s export', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    await t.request('POST', base, { body: { title: 'Already here', available: 'dm', sections: [{ heading: '', text: 'Mine.', available: 'all' }] } });
    const png = await terrain(40, 40);
    const vault = zip({
      'Millbrook/Millbrook.md': '---\nkind: town\ntags: [town, river]\naliases: [The Brook]\nRuler: "[[Mira]]"\n---\nA town by the river.\n\n![[map.png]]\n\n## History\nOld. See [[Mira#Past|the fence]].',
      'Millbrook/The Drowned Rat.md': 'An inn in [[Millbrook]]. ![The sign](../attachments/map.png)',
      'People/Mira.md': '---\naliases:\n  - Mira Vell\n---\nA fence at the docks.',
      'Already here.md': 'Not again.',
      'attachments/map.png': png,
      '.obsidian/app.json': '{}',
    });
    const res = await t.request('POST', `${base}/import`, { body: { filename: 'vault.zip', data: vault } });
    assert.equal(res.statusCode, 201);
    const out = res.json();
    assert.deepEqual(out.pages.map((p) => p.title).sort(), ['Millbrook', 'Mira', 'People', 'The Drowned Rat']);
    assert.equal(out.pictures, 1);
    assert.deepEqual(out.skipped.map((s) => s.name), ['Already here.md']);

    const pages = t.wiki.list(cid);
    const page = (title) => pages.find((p) => p.title === title);
    const town = page('Millbrook');
    assert.equal(town.kind, 'town');
    assert.deepEqual(town.tags, ['town', 'river']);
    assert.deepEqual(town.aliases, ['The Brook']);
    assert.deepEqual(town.facts.map((f) => [f.label, f.value]), [['Ruler', '[[Mira]]']]);
    assert.deepEqual(town.sections.map((s) => s.heading), ['', 'History']);
    assert.match(town.sections[0].text, /^A town by the river\.\n\n!\[\]\(picture:[a-f0-9]{10}\)$/);
    assert.equal(town.sections[1].text, 'Old. See [[Mira|the fence]].');
    assert.match(page('The Drowned Rat').sections[0].text, /!\[The sign\]\(picture:[a-f0-9]{10}\)/);
    assert.equal(page('The Drowned Rat').parent, town.id);
    assert.equal(page('Mira').parent, page('People').id);
    assert.equal(town.parent, null);
    assert.ok(pages.filter((p) => p.title !== 'Already here').every((p) => p.available === 'dm'));

    // Export (the DM's): folders by what each page is inside; pictures beside them.
    const zipped = await t.request('GET', `${base}/export.zip`);
    assert.equal(zipped.headers['content-type'], 'application/zip');
    const files = unzipSync(new Uint8Array(zipped.rawPayload));
    const names = Object.keys(files).sort();
    assert.ok(names.includes('Millbrook/Millbrook.md'), names.join(', '));
    assert.ok(names.includes('Millbrook/The Drowned Rat.md'));
    assert.ok(names.includes('People/Mira.md'));
    assert.ok(names.some((n) => /^pictures\/[a-f0-9]{10}\.png$/.test(n)));
    assert.match(strFromU8(files['Millbrook/Millbrook.md']), /kind: town[\s\S]*aliases: \[The Brook\][\s\S]*!\[\]\(\.\.\/pictures\/[a-f0-9]{10}\.png\)/);

    // Round trip: with the pages gone, the export imports back the same.
    for (const p of t.wiki.list(cid)) await t.wiki.remove(cid, p.id, { by: t.dm.id });
    const back = (await t.request('POST', `${base}/import`, { body: { filename: 'export.zip', data: zipped.rawPayload.toString('base64') } })).json();
    assert.deepEqual(back.pages.map((p) => p.title).sort(), ['Already here', 'Millbrook', 'Mira', 'People', 'The Drowned Rat']);
    const again = t.wiki.list(cid);
    const p2 = (title) => again.find((p) => p.title === title);
    assert.equal(p2('The Drowned Rat').parent, p2('Millbrook').id);
    assert.equal(p2('Millbrook').kind, 'town');
    assert.deepEqual(p2('Millbrook').facts.map((f) => [f.label, f.value]), [['Ruler', '[[Mira]]']]);
    assert.match(p2('Millbrook').sections[0].text, /picture:[a-f0-9]{10}/);

    // A player's export: only what they can see.
    const shared = (await t.request('POST', base, { body: { title: 'The Vale', available: 'all', sections: [{ heading: '', text: 'Green hills.', available: 'all' }, { heading: 'Secret', text: 'A dragon sleeps here.', available: 'dm' }] } })).json().page;
    assert.ok(shared.id);
    const mine = unzipSync(new Uint8Array((await t.request('GET', `${base}/export.zip`, { as: t.sam.token })).rawPayload));
    assert.deepEqual(Object.keys(mine), ['The Vale.md']);
    const text = strFromU8(mine['The Vale.md']);
    assert.match(text, /Green hills/);
    assert.doesNotMatch(text, /dragon|Secret/);
    // The DM as a player gets the same.
    assert.deepEqual(Object.keys(unzipSync(new Uint8Array((await t.request('GET', `${base}/export.zip?as=${t.sam.id}`)).rawPayload))), ['The Vale.md']);
    // Players can't import.
    assert.equal((await t.request('POST', `${base}/import`, { as: t.sam.token, body: { text: 'notes' } })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('wiki import: messy notes and a Word file go to the AI, and wait under Waiting', async () => {
  const asked = [];
  const t = await setup({ llm: createFakeLLM({ wiki: ({ purpose, prompt }) => {
    if (purpose !== 'wiki:import') return { changes: [] };
    asked.push(prompt);
    return { pages: [
      { title: 'Old Pell', kind: 'npc', aliases: [], parent_title: null, sections: [{ heading: '', text: 'Sells rope.' }], facts: [{ label: 'Role', value: 'Merchant' }] },
      { title: 'Millbrook', kind: 'town', sections: [{ heading: 'Market', text: 'Pell trades here.' }] },
    ] };
  } }) });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    await t.request('POST', base, { body: { title: 'Millbrook', available: 'all', sections: [{ heading: '', text: 'A town.', available: 'all' }] } });
    const res = (await t.request('POST', `${base}/import`, { body: { text: 'pell - rope guy, millbrook market' } })).json();
    assert.equal(res.proposals, 2);
    const waiting = (await t.request('GET', `${base}/proposals`)).json().proposals;
    const pell = waiting.find((p) => p.action === 'new_page');
    assert.equal(pell.title, 'Old Pell');
    assert.equal(pell.page_available, 'dm');
    const added = waiting.find((p) => p.action === 'add_section' && p.sections[0].text === 'Pell trades here.');
    assert.ok(added);
    // Approved, it's the DM's alone on a page the players have.
    assert.equal((await t.request('POST', `${base}/proposals/${added.id}/approve`, { body: {} })).statusCode, 200);
    assert.deepEqual(t.wiki.list(cid).find((p) => p.title === 'Millbrook').sections.map((s) => [s.heading, s.available]), [['', 'all'], ['Market', 'dm']]);
    assert.match(asked[0], /pell - rope guy/);

    // A Word file: its paragraphs.
    const docx = zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Session one &amp; two</w:t></w:r></w:p><w:p><w:r><w:t>The party met Pell.</w:t></w:r></w:p></w:body></w:document>' });
    await t.request('POST', `${base}/import`, { body: { filename: 'notes.docx', data: docx } });
    assert.match(asked[1], /Session one & two\nThe party met Pell\./);
  } finally {
    await t.cleanup();
  }
});
