/**
 * Moving the wiki in and out (wiki space stage 9b, `#/import`): the DM imports a Markdown or Obsidian folder as a
 * zip (pages at once) or messy notes (the AI sorts them; they wait under Waiting); everyone downloads the wiki as a
 * Markdown zip as they see it (the DM also a player's version); and prints pages, one or a chosen set, for paper or
 * a PDF through the browser.
 */
import { api, h, fileUrl, readBase64 } from '../../page/api.js';
import { state, nav, base, report, status, playerName } from '../data.js';
import { hero, pageContent } from '../page.js';

/** Download the wiki as a Markdown zip; `as` a player id for their version (the DM's), else as the viewer sees it. */
export async function downloadWiki(as = null) {
  const url = await fileUrl(`${base()}/export.zip${as != null ? `?as=${as}` : ''}`);
  const a = h('a', { href: url, download: `wiki${as != null ? ` (${playerName(as)})` : ''}.zip` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Print these pages (ids), each on its own sheet, as the viewer sees them. */
export async function printPages(ids) {
  let pages;
  try {
    pages = await state.guarded(() => Promise.all(ids.map((id) => api('GET', `${base()}/${id}`))));
  } catch (err) {
    return report(err);
  }
  document.querySelector('#wiki-print')?.remove();
  const sheet = h('div', { id: 'wiki-print' }, ...pages.filter((r) => r.page).map((r) =>
    h('article', { class: 'wiki-page wiki-print-page' }, hero(r.page), h('div', { class: 'wiki-content' }, ...pageContent(r.page, { dm: state.dm, me: state.me, embeds: r.embeds ?? {} })))));
  document.body.append(sheet);
  document.documentElement.classList.add('wiki-printing');
  // Pictures arrive a moment later: wait for them (a little), so they're on the paper.
  await Promise.all([...sheet.querySelectorAll('img')].map((img) => new Promise((resolve) => {
    if (img.complete && img.src) return resolve();
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 4000);
  })));
  const done = () => {
    document.documentElement.classList.remove('wiki-printing');
    sheet.remove();
  };
  window.addEventListener('afterprint', done, { once: true });
  window.print?.();
  // Browsers that don't send afterprint (or print without blocking) tidy up a little later.
  setTimeout(() => { if (sheet.isConnected) done(); }, 60_000);
}

/** The DM's import: a zip of Markdown files, or notes (a file or pasted) for the AI to sort. `imported` after pages come in. */
function importBox(imported) {
  const out = h('div', { class: 'wiki-import-out', role: 'status' });
  const file = h('input', { type: 'file', accept: '.zip,.md,.markdown,.txt,.docx', 'aria-label': 'File to import' });
  const pasted = h('textarea', { rows: 6, placeholder: 'Or paste notes here: session logs, lists, half sentences…', 'aria-label': 'Notes to sort into pages' });
  const say = (...parts) => out.replaceChildren(...parts.filter(Boolean));
  const send = async (body, button) => {
    button.disabled = true;
    say(h('p', { class: 'muted small' }, body.text || !/\.zip$/i.test(body.filename) ? '✦ The AI is sorting your notes into pages…' : 'Importing…'));
    try {
      const res = await state.guarded(() => api('POST', `${base()}/import`, body));
      if (res.pages) {
        await nav.refreshList();
        imported();
        say(
          h('p', {}, `Imported ${res.pages.length} page${res.pages.length === 1 ? '' : 's'}${res.pictures ? ` and ${res.pictures} picture${res.pictures === 1 ? '' : 's'}` : ''}, only for you so far.`),
          res.pages.length ? h('ul', { class: 'wiki-import-list small' }, ...res.pages.slice(0, 50).map((p) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => nav.openPage(p.id) }, p.title)))) : null,
          res.skipped.length ? h('p', { class: 'muted small' }, `Left out: ${res.skipped.map((s) => `${s.name} (${s.why})`).join('; ')}`) : null,
        );
      } else {
        await nav.refreshList();
        say(h('p', {}, res.proposals ? `${res.proposals} page${res.proposals === 1 ? '' : 's'} and additions wait for you under Waiting.` : 'The AI found nothing to make pages of.'),
          res.proposals ? h('button', { type: 'button', class: 'ghost small', onclick: () => nav.go('#/waiting') }, 'Open Waiting') : null);
      }
      file.value = '';
      pasted.value = '';
    } catch (err) {
      say();
      report(err);
    } finally {
      button.disabled = false;
    }
  };
  const fromFile = h('button', { type: 'button', class: 'primary', onclick: async (e) => {
    const button = e.currentTarget;
    const f = file.files?.[0];
    if (!f) return status('Choose a file first.', true);
    send({ filename: f.name, data: await readBase64(f) }, button);
  } }, 'Import the file');
  const fromText = h('button', { type: 'button', class: 'ghost', onclick: (e) => {
    if (!pasted.value.trim()) return status('Paste some notes first.', true);
    send({ text: pasted.value }, e.currentTarget);
  } }, '✦ Sort into pages');
  return h('section', { class: 'wiki-transfer-part card' },
    h('h3', {}, 'Import'),
    h('p', { class: 'muted small' }, 'A Markdown or Obsidian folder as a zip becomes pages straight away: one a file, with its front matter (kind, tags, aliases, short facts), its [[links]] and pictures, and folders as "inside". A single note, a text or Word file, or pasted notes go to the AI, which sorts them into pages that wait for you under Waiting. Everything comes in only for you.'),
    h('div', { class: 'wiki-transfer-row' }, file, fromFile),
    pasted,
    h('div', { class: 'wiki-transfer-row' }, fromText),
    out,
  );
}

function exportBox() {
  const as = state.dm ? h('select', { 'aria-label': 'Whose version' },
    h('option', { value: '' }, 'Everything (yours)'),
    ...state.players.map((p) => h('option', { value: String(p.id) }, `What ${p.character_name || p.name} can see`))) : null;
  return h('section', { class: 'wiki-transfer-part card' },
    h('h3', {}, 'Export'),
    h('p', { class: 'muted small' }, state.dm
      ? 'The wiki as Markdown files in a zip, in folders by what each page is inside, with its pictures: Obsidian and other note apps open it, and it imports back here. A player\'s version has only what they can see.'
      : 'Your wiki as Markdown files in a zip, with its pictures: only what you can see.'),
    h('div', { class: 'wiki-transfer-row' }, as, h('button', { type: 'button', class: 'primary', onclick: () => downloadWiki(as?.value ? Number(as.value) : null).catch(report) }, 'Download the zip')),
  );
}

function printBox() {
  const pages = [...state.pages].sort((a, b) => a.title.localeCompare(b.title));
  const filter = h('input', { type: 'search', placeholder: 'Find pages…', 'aria-label': 'Find pages to print' });
  const rows = pages.map((p) => {
    const box = h('input', { type: 'checkbox', value: p.id });
    return { p, el: h('label', { class: 'wiki-print-choice small' }, box, ` ${p.title}`), box };
  });
  const list = h('div', { class: 'wiki-print-list' }, ...rows.map((r) => r.el));
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    for (const r of rows) r.el.hidden = !!q && !r.p.title.toLowerCase().includes(q);
  });
  return h('section', { class: 'wiki-transfer-part card' },
    h('h3', {}, 'Print'),
    h('p', { class: 'muted small' }, 'Tick pages to print them, one a sheet, for paper or a PDF (choose Save as PDF in the print window). A page also has its own Print button.'),
    filter,
    list,
    h('div', { class: 'wiki-transfer-row' }, h('button', { type: 'button', class: 'primary', onclick: () => {
      const ids = rows.filter((r) => r.box.checked).map((r) => r.p.id);
      if (!ids.length) return status('Tick the pages to print first.', true);
      printPages(ids);
    } }, 'Print the ticked pages')),
  );
}

/** Draw `#/import` into `main`. */
export function drawTransfer(main) {
  let print = printBox();
  // New pages join the print list.
  const imported = () => {
    const next = printBox();
    print.replaceWith(next);
    print = next;
  };
  main.replaceChildren(h('div', { class: 'wiki-transfer' },
    h('h2', {}, state.dm ? 'Import and export' : 'Export and print'),
    state.dm ? importBox(imported) : null,
    exportBox(),
    print,
  ));
}
