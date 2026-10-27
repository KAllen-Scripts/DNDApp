/**
 * Templates (wiki space stage 5a): the Templates view (`#/templates`: the app's starters and the DM's own, each
 * a card with Use, and Edit or Make my own), "Start from" in a new page's editor, and Save as a template. A
 * template gives a new page its kind, sections and facts, with writing prompts shown in them.
 */
import { api, h } from './api.js';
import { STARTER_TEMPLATES, templateFor, fromTemplate } from './shared/wiki-templates.js';
import { KIND_FAMILIES, wikiKey } from './shared/wiki.js';
import { state, nav, base, status, report, fam } from './wiki-data.js';

let own = null; // the DM's own templates, fetched once per visit to the editor or the view

async function load() {
  try {
    own = (await api('GET', `${base()}/templates`)).own;
  } catch (err) {
    report(err);
    own = [];
  }
  return own;
}

const all = () => [...(own ?? []), ...STARTER_TEMPLATES];

/** A new page from a template, in the editor. */
export function newFromTemplate(t) {
  state.open = { page: { id: null, title: '', aliases: [], parent: null, tags: [], available: 'dm', picture: null, banner: null, gallery: [], ...fromTemplate(t) } };
  state.view = 'edit';
  nav.drawList();
  nav.drawMain();
}

/** A template in the editor: the DM's own, or a new one (from a starter, a page, or blank). */
function editTemplate(t = {}) {
  state.open = { page: { id: null, aliases: [], parent: null, tags: [], available: 'dm', picture: null, banner: null, gallery: [], events: [], when: null, title: '', kind: '', sections: [], facts: [], ...t, template: true } };
  state.view = 'edit';
  nav.drawList();
  nav.drawMain();
}

/** Save a page's shape as a template: its kind, headings and facts' labels, with its words as the prompts. */
export function saveAsTemplate(page) {
  const facts = page.facts.map((f) => ({ label: f.label, value: f.value, available: f.available, canon: f.canon }));
  const sections = page.sections.map((s) => ({ heading: s.heading, text: s.text, available: s.available, canon: s.canon }));
  editTemplate({ title: page.kind ? `${page.kind[0].toUpperCase()}${page.kind.slice(1)}` : page.title, kind: page.kind, sections, facts });
  status('Change the words into prompts (what to write in each section), then make the template.');
}

/**
 * "Start from" in a new page's editor: Blank, the DM's templates and the starters. Typing a kind picks its
 * template while nothing is written yet. `use(fields)` redraws the editor with the template's fields.
 */
export function templateChooser({ kind, untouched, use }) {
  const pick = h('select', { 'aria-label': 'Start from' }, h('option', { value: '' }, 'Blank'));
  const fill = () => {
    pick.replaceChildren(h('option', { value: '' }, 'Blank'),
      ...(own?.length ? [h('optgroup', { label: 'Yours' }, ...own.map((t) => h('option', { value: t.id }, `${t.title} (${t.kind || 'any kind'})`)))] : []),
      h('optgroup', { label: 'Starters' }, ...STARTER_TEMPLATES.map((t) => h('option', { value: t.id }, t.title))));
    pick.value = state.open?.page?.from_template ?? '';
  };
  const apply = (t) => use({ ...fromTemplate(t), from_template: t.id });
  pick.addEventListener('change', () => {
    const t = all().find((x) => x.id === pick.value);
    if (!t) return use({ kind: kind.value, sections: [], facts: [], from_template: '' });
    if (!untouched() && !confirm('Start again from this template? What you have written here goes.')) return fill();
    apply(t);
  });
  kind.addEventListener('change', () => {
    if (pick.value || !untouched()) return;
    const t = templateFor(kind.value, own ?? []);
    if (t) apply({ ...t, kind: kind.value });
  });
  load().then(fill);
  fill();
  return {
    el: h('div', { class: 'wiki-start-from' },
      h('label', { class: 'small' }, 'Start from ', pick),
      h('a', { href: '#/templates', class: 'small', onclick: (e) => { e.preventDefault(); nav.go('#/templates'); } }, 'Templates…')),
  };
}

/** The Templates view. */
export async function drawTemplates(main) {
  main.replaceChildren(h('p', { class: 'muted' }, 'Loading the templates…'));
  await load();
  const card = (t) => h('div', { class: `wiki-template-card card fam-${fam(t.kind)}` },
    h('div', { class: 'wiki-template-head' },
      h('span', { class: 'wiki-template-icon', 'aria-hidden': 'true' }, KIND_FAMILIES[fam(t.kind)]?.icon ?? '❦'),
      h('strong', {}, t.title),
      h('span', { class: 'muted small' }, ` ${t.kind || 'any kind'}`)),
    h('ul', { class: 'wiki-template-parts small' },
      ...t.sections.map((s) => h('li', {}, h('strong', {}, s.heading || 'Opening'), s.available === 'dm' ? h('span', { class: 'muted' }, ' (yours)') : null, h('span', { class: 'muted' }, `: ${s.text}`)))),
    t.facts.length ? h('p', { class: 'muted small' }, `At a glance: ${t.facts.map((f) => f.label).join(', ')}`) : null,
    h('div', { class: 'wiki-actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => newFromTemplate(t) }, 'New page from this'),
      t.builtin
        ? h('button', { type: 'button', class: 'ghost', onclick: () => editTemplate({ title: `My ${t.title.toLowerCase()}`, kind: t.kind, sections: t.sections, facts: t.facts }) }, 'Make my own from this')
        : h('button', { type: 'button', class: 'ghost', onclick: () => nav.openPage(t.id, { view: 'edit' }) }, 'Edit'),
      t.builtin ? null : h('button', { type: 'button', class: 'ghost danger', onclick: async () => {
        if (!confirm(`Delete the template "${t.title}"? Pages made from it stay as they are.`)) return;
        try {
          await state.guarded(() => api('DELETE', `${base()}/${t.id}`));
          status(`Deleted the template "${t.title}".`);
          drawTemplates(main);
        } catch (err) {
          report(err);
        }
      } }, 'Delete'),
    ));
  const mine = own ?? [];
  const starters = STARTER_TEMPLATES.filter((t) => !mine.some((m) => wikiKey(m.kind) === wikiKey(t.kind)));
  main.replaceChildren(h('div', { class: 'wiki-templates' },
    h('div', { class: 'wiki-page-head' },
      h('h2', {}, 'Templates'),
      h('div', { class: 'wiki-actions' }, h('button', { type: 'button', class: 'primary', onclick: () => editTemplate() }, '+ New template'))),
    h('p', { class: 'muted small' }, 'A new page of a kind starts from its template: the sections and facts with what to write in each. Yours come first; they are never shown to players or used by Ask.'),
    mine.length ? h('section', {}, h('h3', {}, 'Yours'), h('div', { class: 'wiki-template-grid' }, ...mine.map(card))) : null,
    h('section', {}, h('h3', {}, mine.length ? 'Starters' : 'The starters'), h('div', { class: 'wiki-template-grid' }, ...starters.map(card))),
  ));
}
