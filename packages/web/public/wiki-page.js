/**
 * A page of the DM's wiki, drawn and edited: the banner, the "at a glance"
 * box, sections with their blocks, pictures and [[links]] (with a preview
 * card on hover), the gallery, and the editor. Drawn into whatever holds it,
 * so the same page can show in the wiki or elsewhere.
 */
import { api, h } from './api.js';
import { markdownFragment } from './markdown.js';
import { wikiPieces, wikiKey, LINK_RE, PICTURE_RE, pictureAlt, KIND_FAMILIES, TONES, guessTone, factLinks, factTone } from './shared/wiki.js';
import { sourceChips, sourcesEditor } from './wiki-sources.js';
import { parseWhen, whenText, whenKey } from './shared/wiki-time.js';
import { canonBadge, canonClass, truthNote, canonPicker } from './wiki-canon.js';
import { templateChooser } from './wiki-templates.js';
import { askWriter } from './wiki-write.js';
import { state, nav, base, status, report, availableText, pictureImg, showPicture, uploadPictures, imageFiles, choosePicture, dropTarget, fam, kindBadge, byName } from './wiki-data.js';

/** A picture in the text: ![caption|place](picture:id). */
function figure({ id, caption, place }) {
  return h('span', { class: `wiki-figure${place ? ` place-${place}` : ''}`, role: 'figure', 'aria-label': caption || 'Picture' },
    h('button', { type: 'button', class: 'wiki-figure-open', title: 'Show it bigger', onclick: () => showPicture(id, caption) }, pictureImg(id, { size: place === 'small' ? 'thumb' : 'full', alt: caption })),
    caption ? h('span', { class: 'wiki-figure-caption' }, caption) : null,
  );
}

/** Markdown with [[links]] as buttons that open the page (or offer to make it), and pictures in place. */
export function richText(text, cls = 'wiki-text') {
  const targets = [];
  const pictures = [];
  const marked = text
    .replace(PICTURE_RE, (_, alt, id) => {
      pictures.push({ id, ...pictureAlt(alt) });
      return '<span class="wiki-pic-slot"></span>';
    })
    .replace(LINK_RE, (_, name, shown) => {
      targets.push(name.trim());
      return `<span class="wiki-link">${escapeHtml((shown ?? name).trim())}</span>`;
    });
  const box = h('div', { class: cls });
  box.append(markdownFragment(marked));
  box.querySelectorAll('span.wiki-pic-slot').forEach((span, i) => (pictures[i] ? span.replaceWith(figure(pictures[i])) : span.remove()));
  box.querySelectorAll('span.wiki-link').forEach((span, i) => span.replaceWith(pageLink(targets[i], span.textContent)));
  return box;
}

/** A link to a page by name: opens it, shows a preview of it on hover, or offers to make it. */
export function pageLink(name, text) {
  const page = name && byName(name);
  const b = h('button', {
    type: 'button',
    class: `link wiki-link${page ? '' : ' missing'}`,
    title: page ? '' : `No page called "${name}" yet: click to make it`,
    // In the drawer a link opens its page there; elsewhere in the wiki, in the wiki.
    onclick: (e) => {
      const inDrawer = !!e.currentTarget.closest('#wiki-drawer');
      if (page) return inDrawer ? nav.drawer(page.id) : nav.openPage(page.id);
      if (inDrawer) nav.enter();
      nav.newPage(name);
    },
  }, text);
  if (page) {
    b.addEventListener('mouseenter', () => showPreview(b, page));
    b.addEventListener('focus', () => showPreview(b, page));
    b.addEventListener('mouseleave', hidePreview);
    b.addEventListener('blur', hidePreview);
  }
  return b;
}

// The card shown over a link: the page's picture, kind and opening words (like Kanka's and World Anvil's tooltips).
let preview = null;
export function showPreview(anchor, p) {
  hidePreview();
  preview = h('div', { class: `wiki-preview fam-${fam(p.kind)}`, role: 'tooltip' },
    p.picture ? h('div', { class: 'wiki-preview-art' }, pictureImg(p.picture, { size: 'thumb' })) : null,
    h('div', { class: 'wiki-preview-body' },
      kindBadge(p.kind),
      h('strong', {}, p.title),
      p.excerpt ? h('p', {}, p.excerpt) : null),
  );
  document.body.append(preview);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  preview.style.width = `${w}px`;
  preview.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const below = r.bottom + 8;
  preview.style.top = `${below + 240 > window.innerHeight && r.top > 260 ? Math.max(8, r.top - 8 - (preview.offsetHeight || 220)) : below}px`;
}
export function hidePreview() {
  preview?.remove();
  preview = null;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A section's text: plain parts as they are, blocks in a box that says who they're for. */
export function sectionBody(text) {
  return wikiPieces(text).map((p) => {
    if (!p.block) return richText(p.text);
    const who = p.block.dm ? 'Only you' : `Only for ${p.block.names.join(', ') || 'nobody yet'}`;
    return h('div', { class: 'wiki-block' }, h('div', { class: 'wiki-block-label muted small' }, who), richText(p.text));
  });
}

/** The pages above this one, outermost first. */
function ancestors(page) {
  const out = [];
  for (let at = page.parent, steps = 0; at && steps < 50; steps++) {
    const p = state.pages.find((x) => x.id === at);
    if (!p) break;
    out.unshift(p);
    at = p.parent;
  }
  return out;
}

/** The banner across the top: the banner picture (or the kind's colours), where it sits, the kind and the title. */
export function hero(page) {
  const chain = ancestors(page);
  return h('header', { class: `wiki-hero fam-${fam(page.kind)}${page.banner ? ' has-banner' : ''}` },
    page.banner ? pictureImg(page.banner.id, { cls: 'wiki-hero-img', alt: page.banner.caption, style: `object-position: 50% ${page.banner.focus ?? 50}%` }) : null,
    h('div', { class: 'wiki-hero-text' },
      chain.length ? h('nav', { class: 'wiki-crumbs small', 'aria-label': 'Inside' }, ...chain.flatMap((p, i) => [i ? h('span', { 'aria-hidden': 'true' }, ' › ') : null, h('button', { type: 'button', class: 'link', onclick: () => nav.openPage(p.id) }, p.title)])) : null,
      kindBadge(page.kind, ' on-hero'),
      h('h2', {}, page.title),
      page.when ? h('p', { class: 'wiki-when small', title: page.when.from == null ? 'Not a time the Timeline can place' : page.when.text }, h('span', { 'aria-hidden': 'true' }, '◷ '), whenText(page.when, state.calendar)) : null,
    ),
  );
}

/** Who a picture or fact is available to, for the DM, when it isn't as the page. */
/** The DM's Send as a handout button for part of a saved page (wiki-handout.js). */
const sendButton = (page, part, label, dm) => (dm && page.id && nav.sendHandout
  ? h('button', { type: 'button', class: 'ghost small wiki-send', title: `Send ${label.toLowerCase()} to players as a handout`, onclick: () => nav.sendHandout(page, part, label) }, 'Send as a handout')
  : null);

const ownAvailable = (x, dm) => (dm && x.available !== 'all' ? h('span', { class: 'wiki-available small' }, ` (${availableText(x.available)})`) : null);

/** A picture's caption with its canon (a planned picture's caption never reaches a player) and who it's available to. */
function captionOf(pic, dm, me = null) {
  const marked = canonClass(pic);
  if (!pic.caption && !(dm && (pic.available !== 'all' || marked))) return null;
  return h('figcaption', { class: marked.trim() || null }, canonBadge(pic, { me }), h('span', { class: 'wiki-canon-text' }, pic.caption), dm ? truthNote(pic) : null, ownAvailable(pic, dm));
}

/** The "at a glance" box: the page's picture, its facts, where it is and what's inside it. */
function infobox(page, { dm, me = null }) {
  const children = dm ? state.pages.filter((p) => p.parent === page.id).sort((a, b) => a.title.localeCompare(b.title)) : [];
  const parent = page.parent && state.pages.find((p) => p.id === page.parent);
  if (!page.picture && !page.facts?.length && !children.length && !(dm && parent)) return null;
  return h('aside', { class: `wiki-infobox fam-${fam(page.kind)}`, 'aria-label': 'At a glance' },
    h('div', { class: 'wiki-infobox-title' }, page.title),
    page.picture ? h('figure', { class: 'wiki-infobox-picture' },
      h('button', { type: 'button', class: 'wiki-figure-open', title: 'Show it bigger', onclick: () => showPicture(page.picture.id, page.picture.caption) }, pictureImg(page.picture.id, { alt: page.picture.caption || page.title })),
      captionOf(page.picture, dm, me)) : null,
    page.facts?.length || (dm && parent) ? h('dl', { class: 'wiki-facts' },
      ...(page.facts ?? []).flatMap((f) => [h('dt', { class: canonClass(f).trim() || null }, f.label), h('dd', { class: `${canonClass(f)}${factLinks(f).length ? ` wiki-tie tone-${factTone(f)}` : ''}`.trim() || null }, canonBadge(f, { me }), richText(f.value, 'wiki-fact-value'), dm ? truthNote(f) : null, ownAvailable(f, dm), sourceChips(f.sources, { as: me }))]),
      ...(dm && parent ? [h('dt', {}, 'Inside'), h('dd', {}, pageLink(parent.title, parent.title))] : []),
    ) : null,
    children.length ? h('div', { class: 'wiki-children' },
      h('div', { class: 'wiki-children-head small' }, 'Inside it'),
      h('ul', {}, ...children.map((c) => h('li', { class: `fam-${fam(c.kind)}` }, pageLink(c.title, c.title))))) : null,
    page.facts?.length || page.picture ? sendButton(page, { glance: true }, 'The at-a-glance box', dm) : null,
  );
}

function gallery(page, { dm, me = null }) {
  if (!page.gallery?.length) return null;
  return h('section', { class: 'wiki-gallery' },
    h('h3', {}, 'Gallery'),
    h('div', { class: 'wiki-gallery-grid' }, ...page.gallery.map((g) => h('figure', {},
      h('button', { type: 'button', class: 'wiki-figure-open', title: 'Show it bigger', onclick: () => showPicture(g.id, g.caption) }, pictureImg(g.id, { size: 'thumb', alt: g.caption })),
      captionOf(g, dm, me),
      sendButton(page, { picture: g.id }, 'A picture', dm)))),
  );
}

/** The page's events (stage 4b), in order of when they happened; undated ones last. */
function eventsList(page, { dm, me = null }) {
  if (!page.events?.length) return null;
  const sorted = [...page.events].sort((a, b) => whenKey(a.when) - whenKey(b.when));
  return h('section', { class: 'wiki-events' },
    h('h3', {}, 'Events'),
    h('ol', { class: 'wiki-event-list' }, ...sorted.map((e) => h('li', { class: `wiki-event${canonClass(e)}` },
      h('span', { class: `wiki-event-when${e.when?.from == null ? ' undated' : ''}` }, e.when ? whenText(e.when, state.calendar) : 'Undated'),
      h('div', { class: 'wiki-event-body' },
        canonBadge(e, { me }),
        h('div', { class: 'wiki-canon-text' }, richText(e.text, 'wiki-event-text')),
        dm ? truthNote(e) : null,
        ownAvailable(e, dm),
        sourceChips(e.sources, { as: me })),
    ))),
  );
}

/** What's on a page below its banner: the at-a-glance box beside the sections, then the events and the gallery. */
export function pageContent(page, { dm, me = null }) {
  const box = infobox(page, { dm, me });
  const body = h('div', { class: 'wiki-body' }, ...sections(page, { dm, me }), eventsList(page, { dm, me }), gallery(page, { dm, me }));
  return [h('div', { class: `wiki-layout${box ? ' with-box' : ''}` }, box, body)];
}

function sections(page, { dm, me = null }) {
  if (!page.sections.length) return [h('p', { class: 'muted' }, dm ? 'This page is empty. Press Edit to write it.' : 'No text on this page is available.')];
  return page.sections.map((s) => h('section', { class: `wiki-section${canonClass(s)}`, 'data-section': s.id },
    s.heading || canonClass(s) ? h('h3', {}, canonBadge(s, { me }), s.heading) : null,
    dm ? truthNote(s) : null,
    dm && s.by === 'ai' ? h('p', { class: 'wiki-by-ai muted small' }, 'Written by the AI. It keeps this section up to date (with your approval) until you change it.') : null,
    dm && s.available !== 'all' ? h('p', { class: 'wiki-available small' }, `Available to ${availableText(s.available, { section: true })}.`) : null,
    h('div', { class: 'wiki-canon-text' }, ...(dm ? sectionBody(s.text) : [richText(s.text)])),
    sourceChips(s.sources, { as: me }),
    s.id ? sendButton(page, { section: s.id }, s.heading ? `The section "${s.heading}"` : 'A section', dm) : null,
  ));
}

// ---------- making and editing ----------

/** A "who is it available to" picker: { el, value() }. */
export function availablePicker(value, { section = false, label }) {
  const mode = h('select', { 'aria-label': label },
    section ? h('option', { value: 'all' }, 'Same as the page') : h('option', { value: 'dm' }, 'Only me'),
    section ? h('option', { value: 'dm' }, 'Only me') : h('option', { value: 'all' }, 'Everyone'),
    h('option', { value: 'some' }, 'Chosen players'),
  );
  mode.value = Array.isArray(value) ? 'some' : value;
  const boxes = state.players.map((p) => h('label', {}, h('input', { type: 'checkbox', value: String(p.id), checked: Array.isArray(value) && value.includes(p.id) }), ` ${p.character_name || p.name}`));
  const who = h('span', { class: 'wiki-who', hidden: mode.value !== 'some' }, ...(boxes.length ? boxes : [h('span', { class: 'muted small' }, 'No players in this campaign yet.')]));
  mode.addEventListener('change', () => { who.hidden = mode.value !== 'some'; });
  return {
    el: h('span', { class: 'wiki-picker' }, mode, who),
    value: () => (mode.value === 'some' ? boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value)) : mode.value),
  };
}

const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Put text into a textarea where the cursor is, on lines of its own. */
function insertAt(area, snippet) {
  const at = area.selectionStart ?? area.value.length;
  const before = area.value.slice(0, at);
  const after = area.value.slice(area.selectionEnd ?? at);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  area.value = `${before}${lead}${snippet}\n${after}`;
  const caret = before.length + lead.length + snippet.length + 1;
  area.setSelectionRange?.(caret, caret);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * One picture of the page in the editor (the main picture or the banner):
 * Choose…, Remove, its caption and who it's available to. { el, value() }.
 */
function pictureSlot(label, current, { banner = false } = {}) {
  let pic = current ? { ...current } : null;
  const el = h('div', { class: `wiki-slot${banner ? ' wiki-slot-banner' : ''}` });
  let caption;
  let picker;
  let focus;
  let canon;
  const draw = () => {
    caption = h('input', { value: pic?.caption ?? '', maxLength: 300, placeholder: 'Caption (optional)', 'aria-label': `${label} caption` });
    picker = availablePicker(pic?.available ?? 'all', { section: true, label: `${label} available to` });
    canon = canonPicker(pic, { label: `${label} caption` });
    focus = banner ? h('input', { type: 'range', min: 0, max: 100, value: String(pic?.focus ?? 50), 'aria-label': 'Banner position' }) : null;
    const thumb = pic ? pictureImg(pic.id, { size: 'thumb', alt: '', style: banner ? `object-position: 50% ${pic.focus ?? 50}%` : null }) : h('span', { class: 'wiki-slot-empty' }, 'No picture');
    focus?.addEventListener('input', () => { thumb.style.objectPosition = `50% ${focus.value}%`; });
    el.replaceChildren(...[
      h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, label)),
      h('div', { class: 'wiki-slot-thumb' }, thumb),
      h('div', { class: 'wiki-slot-actions' },
        h('button', { type: 'button', class: 'ghost', 'aria-label': `Choose ${label.toLowerCase()}`, onclick: async () => {
          const id = await choosePicture(`Choose ${label.toLowerCase()}`);
          if (!id) return;
          pic = { id, caption: caption.value, available: picker.value(), ...(banner && { focus: 50 }) };
          draw();
        } }, pic ? 'Change…' : 'Choose…'),
        pic ? h('button', { type: 'button', class: 'ghost danger', onclick: () => { pic = null; draw(); } }, 'Remove') : null,
      ),
      pic ? caption : null,
      pic && banner ? h('label', { class: 'small' }, 'Show from top to bottom ', focus) : null,
      pic ? h('label', { class: 'small' }, 'Available to ', picker.el) : null,
      pic ? h('label', { class: 'small' }, 'Caption is ', canon.el) : null,
    ].filter(Boolean));
  };
  draw();
  dropTarget(el, async (files) => {
    try {
      const [first] = await uploadPictures(files.slice(0, 1));
      pic = { id: first.id, caption: caption?.value ?? '', available: 'all', ...(banner && { focus: 50 }) };
      draw();
    } catch (err) {
      report(err);
    }
  });
  return {
    el,
    value: () => (pic ? { id: pic.id, caption: caption.value.trim(), available: picker.value(), ...canon.value(), ...(banner && { focus: Number(focus.value) }) } : null),
  };
}

/** The gallery in the editor: pictures with captions, each with who it's available to. { el, value() }. */
function galleryEditor(items) {
  const rows = [];
  const list = h('div', { class: 'wiki-gallery-edit' });
  const add = (g) => {
    const caption = h('input', { value: g.caption ?? '', maxLength: 300, placeholder: 'Caption', 'aria-label': 'Gallery caption' });
    const picker = availablePicker(g.available ?? 'all', { section: true, label: 'Gallery picture available to' });
    const canon = canonPicker(g, { label: 'Gallery caption' });
    const row = { id: g.id, caption, picker, canon };
    row.el = h('div', { class: 'wiki-gallery-item card' },
      pictureImg(g.id, { size: 'thumb' }),
      caption,
      picker.el,
      canon.el,
      h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Take it out of the gallery', 'aria-label': 'Remove from gallery', onclick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.el.remove();
      } }, '✕'),
    );
    rows.push(row);
    list.append(row.el);
  };
  for (const g of items) add(g);
  const el = h('div', { class: 'wiki-edit-gallery' },
    h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, 'Gallery'), h('span', { class: 'muted small' }, ' more pictures, shown as a grid under the text')),
    list,
    h('button', { type: 'button', class: 'ghost', onclick: async () => {
      const id = await choosePicture('Add to the gallery');
      if (id) add({ id, caption: '', available: 'all' });
    } }, '+ Add to the gallery'),
  );
  dropTarget(el, async (files) => {
    try {
      for (const p of await uploadPictures(files)) add({ id: p.id, caption: '', available: 'all' });
    } catch (err) {
      report(err);
    }
  });
  return { el, value: () => rows.map((r) => ({ id: r.id, caption: r.caption.value.trim(), available: r.picker.value(), ...r.canon.value() })) };
}

/**
 * A relationship's tone (stage 3c), on a fact that links a page: guessed from the label unless the DM picks one.
 * Hidden while the fact links nothing. { el, value() }.
 */
function toneSelect(f, label, value) {
  const guessed = h('option', { value: '' });
  const el = h('select', { class: 'wiki-tone-pick', 'aria-label': 'How they feel' }, guessed,
    ...TONES.map((t) => h('option', { value: t }, t[0].toUpperCase() + t.slice(1))));
  el.value = TONES.includes(f.tone) ? f.tone : '';
  const show = () => {
    guessed.textContent = `${guessTone(label.value)[0].toUpperCase()}${guessTone(label.value).slice(1)} (from the label)`;
    el.hidden = !factLinks({ value: value.value }).length;
  };
  label.addEventListener('input', show);
  value.addEventListener('input', show);
  show();
  return { el, value: () => (!el.hidden && el.value ? { tone: el.value } : {}) };
}

/** The "at a glance" facts in the editor, with the usual ones for the page's kind a click away. { el, value(), kindChanged() }. */
function factsEditor(facts, kindInput, { template = false } = {}) {
  const rows = [];
  const list = h('div', { class: 'wiki-facts-edit' });
  const add = (f) => {
    const label = h('input', { value: f.label ?? '', maxLength: 60, placeholder: 'Race, Region, Leader…', 'aria-label': 'Fact' });
    const value = h('input', { value: f.value ?? '', maxLength: 500, placeholder: f.prompt || 'What it is. [[Links]] work.', 'aria-label': 'Fact value' });
    const picker = availablePicker(f.available ?? 'all', { section: true, label: 'Fact available to' });
    const canon = canonPicker(f, { label: 'Fact' });
    const sources = sourcesEditor(f.sources);
    const tone = toneSelect(f, label, value);
    const row = { label, value, picker, canon, sources, tone };
    row.el = h('div', { class: 'wiki-fact-row' }, label, value, picker.el, canon.el, tone.el, sources.el,
      h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Remove this fact', 'aria-label': 'Remove fact', onclick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.el.remove();
      } }, '✕'));
    rows.push(row);
    list.append(row.el);
  };
  for (const f of facts) add(f);
  const usual = h('button', { type: 'button', class: 'ghost' });
  const kindChanged = () => {
    const family = KIND_FAMILIES[fam(kindInput.value)];
    usual.hidden = !family.facts.length;
    usual.textContent = `+ The usual for ${family.label.toLowerCase()}`;
  };
  usual.addEventListener('click', () => {
    const have = new Set(rows.map((r) => wikiKey(r.label.value)));
    for (const label of KIND_FAMILIES[fam(kindInput.value)].facts) if (!have.has(wikiKey(label))) add({ label, value: '' });
  });
  kindInput.addEventListener('input', kindChanged);
  kindChanged();
  return {
    el: h('div', { class: 'wiki-edit-facts' },
      h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, 'At a glance'), h('span', { class: 'muted small' }, ' short facts in the box beside the text')),
      list,
      h('div', { class: 'wiki-edit-foot' }, h('button', { type: 'button', class: 'ghost', onclick: () => add({ label: '', value: '' }) }, '+ Add a fact'), usual),
    ),
    // A fact left empty (the usual ones not filled in) isn't kept; a template's needs a label (its value is the prompt).
    value: () => rows.map((r) => ({ label: r.label.value.trim(), value: r.value.value.trim(), available: r.picker.value(), ...r.canon.value(), ...r.sources.value(), ...r.tone.value() })).filter((f) => (template ? f.label && f.value : f.value)),
  };
}

/** A time box with what it reads as underneath, live (the server works it out again when it's saved). { el, input } */
function whenInput(value, label) {
  const input = h('input', { value: value?.text ?? '', maxLength: 200, placeholder: 'Day 12 night, 3 Mirtul 1492, 300 years ago…', 'aria-label': label });
  const says = h('span', { class: 'muted small wiki-when-says' });
  const show = () => {
    const w = parseWhen(input.value, state.calendar, { now: state.clock });
    says.textContent = !w ? '' : w.from == null ? 'Kept as written (not a time the Timeline can place)' : `Reads as ${whenText(w, state.calendar)}`;
  };
  input.addEventListener('input', show);
  show();
  return { input, says };
}

/** The page's events in the editor: when, what happened, who it's for, true or rumour, how we know. { el, value() } */
function eventsEditor(events) {
  const rows = [];
  const list = h('div', { class: 'wiki-events-edit' });
  const add = (e) => {
    const when = whenInput(e.when, 'When it happened');
    const text = h('input', { value: e.text ?? '', maxLength: 2000, placeholder: 'What happened. [[Links]] work.', 'aria-label': 'What happened' });
    const picker = availablePicker(e.available ?? 'all', { section: true, label: 'Event available to' });
    const canon = canonPicker(e, { label: 'Event' });
    const sources = sourcesEditor(e.sources);
    const row = { id: e.id, when, text, picker, canon, sources };
    row.el = h('div', { class: 'wiki-event-row' }, when.input, text, picker.el, canon.el,
      h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Remove this event', 'aria-label': 'Remove event', onclick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.el.remove();
      } }, '✕'),
      when.says, sources.el);
    rows.push(row);
    list.append(row.el);
  };
  for (const e of events) add(e);
  return {
    el: h('div', { class: 'wiki-edit-events' },
      h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, 'Events'), h('span', { class: 'muted small' }, ' dated lines: what happened here, and when')),
      list,
      h('div', { class: 'wiki-edit-foot' }, h('button', { type: 'button', class: 'ghost', onclick: () => add({ text: '' }) }, '+ Add an event'))),
    value: () => rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), when: r.when.input.value.trim() ? { text: r.when.input.value.trim() } : null, text: r.text.value.trim(), available: r.picker.value(), ...r.canon.value(), ...r.sources.value() })).filter((e) => e.text),
  };
}

/**
 * The page editor. A template (stage 5a: `page.template`) is edited with the same form: its sections' text and its
 * facts' values are the writing prompts a new page shows. A new page can start from a template.
 */
export function editor(page) {
  const isNew = !page.id;
  const template = !!page.template;
  const title = h('input', { value: page.title, maxLength: 200, required: true, 'aria-label': 'Title' });
  const kinds = [...new Set([...state.pages.map((p) => p.kind).filter(Boolean), 'npc', 'place', 'faction', 'item', 'quest', 'lore'])].sort();
  const kind = h('input', { value: page.kind, maxLength: 60, list: 'wiki-kinds', placeholder: 'npc, place, faction, lore…', 'aria-label': 'Kind' });
  const kindList = h('datalist', { id: 'wiki-kinds' }, ...kinds.map((k) => h('option', { value: k })));
  const aliases = h('input', { value: page.aliases.join(', '), placeholder: 'Other names and spellings, with commas', 'aria-label': 'Other names' });
  const tags = h('input', { value: page.tags.join(', '), placeholder: 'With commas', 'aria-label': 'Tags' });
  const parent = h('select', { 'aria-label': 'Inside' },
    h('option', { value: '' }, '(top level)'),
    ...state.pages.filter((p) => p.id !== page.id).sort((a, b) => a.title.localeCompare(b.title)).map((p) => h('option', { value: p.id, selected: p.id === page.parent }, p.title)),
  );
  const available = availablePicker(page.available, { label: 'Page available to' });
  const mainPicture = pictureSlot('Main picture', page.picture);
  const banner = pictureSlot('Banner', page.banner, { banner: true });
  const galleryEd = galleryEditor(page.gallery ?? []);
  const factsEd = factsEditor(page.facts ?? [], kind, { template });
  const when = whenInput(page.when, 'When');
  const eventsEd = eventsEditor(page.events ?? []);
  const list = h('div', { class: 'wiki-edit-sections' });
  const rows = [];

  const addSection = (s = { heading: '', text: '', available: 'all' }) => {
    const heading = h('input', { value: s.heading, maxLength: 200, placeholder: 'Heading (optional)', 'aria-label': 'Section heading' });
    const text = h('textarea', { rows: s.prompt ? 4 : 8, 'aria-label': template ? 'Writing prompt' : 'Section text', placeholder: template ? 'The writing prompt a new page shows here: what to write in this section.' : s.prompt || 'Markdown. [[Page name]] links a page. A block between ":::for Thorin" and ":::" is only for Thorin; ":::dm" is only for you. Paste or drop a picture to put it here.' });
    text.value = s.text;
    const addPictures = async (files) => {
      try {
        for (const p of await uploadPictures(files)) insertAt(text, `![${p.name}](picture:${p.id})`);
      } catch (err) {
        report(err);
      }
    };
    text.addEventListener('paste', (e) => {
      const files = imageFiles(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      addPictures(files);
    });
    dropTarget(text, addPictures);
    const picker = availablePicker(s.available, { section: true, label: 'Section available to' });
    const canon = canonPicker(s, { label: 'Section' });
    const sources = sourcesEditor(s.sources);
    const row = { id: s.id, heading, text, picker, canon, sources, fromTemplate: !!s.from_template, prompt: s.prompt ?? '' };
    const move = (d) => {
      const i = rows.indexOf(row);
      const j = i + d;
      if (j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      list.replaceChildren(...rows.map((r) => r.el));
    };
    row.el = h('div', { class: 'wiki-edit-section card' },
      h('div', { class: 'wiki-edit-row' }, heading,
        h('button', { type: 'button', class: 'ghost icon-btn', title: 'Move up', 'aria-label': 'Move section up', onclick: () => move(-1) }, '↑'),
        h('button', { type: 'button', class: 'ghost icon-btn', title: 'Move down', 'aria-label': 'Move section down', onclick: () => move(1) }, '↓'),
        h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Remove this section', 'aria-label': 'Remove section', onclick: () => {
          if ((text.value.trim() || heading.value.trim()) && !confirm('Remove this section? (Earlier versions stay in the history.)')) return;
          rows.splice(rows.indexOf(row), 1);
          row.el.remove();
        } }, '✕'),
      ),
      h('div', { class: 'wiki-text-tools' },
        h('label', { class: 'small' }, 'Available to ', picker.el),
        h('label', { class: 'small' }, 'It is ', canon.el),
        h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Put a picture in this section', onclick: async () => {
          const id = await choosePicture('Put a picture in the text');
          if (id) insertAt(text, `![](picture:${id})`);
        } }, '+ Picture'),
        // The AI on a saved section (stage 5b): what it writes waits under Waiting for you.
        ...(s.id && !isNew && !template ? [
          h('button', { type: 'button', class: 'ghost small wiki-ai-btn', title: 'Add more to this section from the records (as saved)', onclick: (e) => askWriter({ mode: 'expand', page_id: page.id, section_id: s.id }, e.currentTarget) }, '✦ Expand'),
          h('button', { type: 'button', class: 'ghost small wiki-ai-btn', title: 'Smooth the wording of this section (as saved), keeping every fact', onclick: (e) => askWriter({ mode: 'tidy', page_id: page.id, section_id: s.id }, e.currentTarget) }, '✦ Tidy'),
        ] : []),
      ),
      text,
      sources.el,
      h('p', { class: 'muted small wiki-hint' }, 'A picture shows where its line is. Write a caption between the brackets; add |right, |left, |small or |wide after it to place it: ![The mill at dusk|right](picture:…). A picture inside a :::dm block stays with you.'),
    );
    rows.push(row);
    list.append(row.el);
  };
  for (const s of page.sections) addSection(s);
  if (!page.sections.length) addSection();

  const save = h('button', { type: 'submit', class: 'primary' }, template ? (isNew ? 'Make template' : 'Save template') : isNew ? 'Make page' : 'Save');
  // A new page: start from a template (the kind's, once a kind is typed, while nothing is written yet).
  const chooser = isNew && !template ? templateChooser({
    kind,
    untouched: () => rows.every((r) => !r.text.value.trim()) && !factsEd.value().length,
    use: (fields) => {
      state.open = { page: { ...page, ...fields, title: title.value } };
      nav.drawMain();
    },
  }) : null;
  const form = h('form', { class: `wiki-editor${template ? ' wiki-template-editor' : ''}` },
    h('h2', {}, template ? (isNew ? 'New template' : `Editing the template ${page.title}`) : isNew ? 'New page' : `Editing ${page.title}`),
    chooser?.el,
    template ? h('p', { class: 'muted small' }, 'A template gives a new page its kind, sections and facts. What you write in each section and fact is the prompt the new page shows in it. Templates are only yours: never in Ask or a player\'s wiki.') : null,
    h('div', { class: 'wiki-edit-grid' },
      h('label', {}, template ? 'Template name' : 'Title', title),
      h('label', {}, template ? 'Kind of page it makes' : 'Kind', kind, kindList),
      ...(template ? [] : [
        h('label', {}, 'Other names', aliases),
        h('label', {}, 'Inside', parent),
        h('label', {}, 'Tags', tags),
        h('label', {}, 'Page available to', available.el),
        h('label', {}, 'When (if it happened at a time)', when.input, when.says),
      ]),
    ),
    template ? null : h('p', { class: 'muted small' }, 'A new page is only yours until you choose otherwise. Each section, fact, picture and block can narrow it further, never widen it. Other names are never shown to players.'),
    template ? null : h('fieldset', { class: 'wiki-edit-pictures' },
      h('legend', {}, 'Pictures'),
      h('div', { class: 'wiki-slots' }, mainPicture.el, banner.el),
      galleryEd.el,
    ),
    h('fieldset', { class: 'wiki-edit-box' }, h('legend', {}, 'At a glance'), factsEd.el),
    template ? null : h('fieldset', { class: 'wiki-edit-box' }, h('legend', {}, 'Events'), eventsEd.el),
    list,
    h('div', { class: 'wiki-edit-foot' },
      h('button', { type: 'button', class: 'ghost', onclick: () => addSection() }, '+ Add section'),
      template ? null : h('button', { type: 'button', class: 'ghost wiki-ai-btn', title: isNew ? 'The AI writes this page from what the records say; it waits under Waiting for you' : 'The AI fills this page (as saved) from what the records say; it waits under Waiting for you', onclick: (e) => {
        if (isNew && !title.value.trim()) return status('Give the page a title first.', true);
        askWriter(isNew
          ? { mode: 'draft', page: { title: title.value.trim(), kind: kind.value.trim(), sections: rows.map((r) => ({ heading: r.heading.value.trim(), prompt: r.prompt })) } }
          : { mode: 'draft', page_id: page.id }, e.currentTarget);
      } }, '✦ Draft from the records'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'ghost', onclick: () => {
        if (template) return nav.go('#/templates');
        if (isNew) state.open = null;
        state.view = 'page';
        nav.drawMain();
      } }, 'Cancel'),
      save,
    ),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: title.value.trim(),
      kind: kind.value.trim(),
      aliases: splitList(aliases.value),
      tags: splitList(tags.value),
      parent: parent.value || null,
      available: available.value(),
      picture: mainPicture.value(),
      banner: banner.value(),
      gallery: galleryEd.value(),
      facts: factsEd.value(),
      when: when.input.value.trim() ? { text: when.input.value.trim() } : null,
      events: eventsEd.value(),
      // A template's section left without writing isn't kept.
      sections: rows.filter((r) => !r.fromTemplate || r.text.value.trim()).map((r) => ({ ...(r.id ? { id: r.id } : {}), heading: r.heading.value.trim(), text: r.text.value, available: r.picker.value(), ...r.canon.value(), ...r.sources.value() })),
    };
    if (template) {
      for (const k of ['aliases', 'tags', 'parent', 'available', 'picture', 'banner', 'gallery', 'when', 'events']) delete body[k];
      if (isNew) body.template = true;
    }
    save.disabled = true;
    try {
      await state.guarded(async () => {
        const res = isNew ? await api('POST', base(), body) : await api('PUT', `${base()}/${page.id}`, { ...body, version: page.version });
        if (template) {
          status(isNew ? `Made the template "${res.page.title}".` : 'Saved the template.');
          return nav.go('#/templates');
        }
        await nav.refreshList();
        state.open = isNew ? await api('GET', `${base()}/${res.page.id}`) : res;
        state.view = 'page';
        nav.drawList();
        nav.drawMain();
        status(isNew ? `Made "${res.page.title}".` : 'Saved.');
      });
    } catch (err) {
      report(err);
    } finally {
      save.disabled = false;
    }
  });
  queueMicrotask(() => title.focus());
  return form;
}
