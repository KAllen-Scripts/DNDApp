/**
 * Moving the wiki in and out (wiki space stage 9b).
 *
 * Import: a Markdown or Obsidian folder as a zip becomes pages (one a file; front matter for kind, tags, aliases
 * and short facts; `[[links]]` kept; pictures into the wiki's pictures; folders become "inside"), all the DM's.
 * Messy notes (text, Markdown, a Word file) go to the AI instead (wiki-ai.js `importNotes`).
 *
 * Export: a zip of Markdown files, one a page, as the viewer sees the wiki (the DM, or a player's version with
 * nothing hidden in it), in folders by what each page is inside; its pictures beside them. It imports back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { wikiKey, pagePictureIds } from '@dndapp/shared/wiki.js';
import { BadRequestError } from './store.js';
import { WIKI_LIMITS as L } from './wiki.js';

const MAX_FILES = 3000;
const MAX_UNZIPPED = 300 * 1024 * 1024;
const PICTURE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const NOTE_EXT = /\.(md|markdown|txt)$/i;
// Front matter keys that aren't facts.
const META_KEYS = new Set(['title', 'kind', 'type', 'tags', 'tag', 'aliases', 'alias', 'inside', 'parent', 'available', 'cssclass', 'cssclasses', 'publish', 'created', 'updated', 'date created', 'date modified']);

export const isZip = (buf) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

/** Unzip, skipping folders, hidden files (.obsidian, .DS_Store) and __MACOSX; refuses a zip too big to be notes. */
function unzip(buf) {
  let files;
  try {
    let total = 0;
    let count = 0;
    files = unzipSync(new Uint8Array(buf), {
      filter: (f) => {
        if (f.name.endsWith('/') || f.name.split('/').some((p) => p.startsWith('.') || p === '__MACOSX')) return false;
        if (!NOTE_EXT.test(f.name) && !PICTURE_EXT.test(f.name)) return false;
        total += f.originalSize;
        if (++count > MAX_FILES || total > MAX_UNZIPPED) throw new BadRequestError('That zip is too big to import: split it up.');
        return true;
      },
    });
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError("That isn't a zip file that can be read.");
  }
  return Object.entries(files).map(([name, data]) => ({ name: name.replace(/\\/g, '/'), data }));
}

/** The text of a Word file (.docx): its paragraphs, one a line. Null when it isn't one. */
export function docxText(buf) {
  if (!isZip(buf)) return null;
  let xml;
  try {
    const f = unzipSync(new Uint8Array(buf), { filter: (x) => x.name === 'word/document.xml' })['word/document.xml'];
    if (!f) return null;
    xml = strFromU8(f);
  } catch {
    return null;
  }
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ent[e])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A little YAML: `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. Anything else is skipped. */
export function frontMatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { meta: {}, body: text.replace(/^﻿/, '') };
  const meta = {};
  let listKey = null;
  const unquote = (v) => v.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      meta[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z][\w -]*?)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const v = kv[2].trim();
    listKey = null;
    if (!v) {
      meta[key] = [];
      listKey = key;
    } else if (/^\[.*\]$/.test(v)) {
      meta[key] = v.slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else {
      meta[key] = unquote(v);
    }
  }
  return { meta, body: text.slice(m[0].length) };
}

const asList = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map((x) => String(x).trim().replace(/^#/, '')).filter(Boolean);
const baseName = (name) => path.posix.basename(name).replace(/\.[^.]+$/, '');
/** `[[Page]]` from a front matter value like "[[Millbrook]]", or the plain words. */
const linkName = (v) => String(v ?? '').trim().replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1').trim();

/** A page's text in sections: the words before the first `## ` heading, then one a heading. */
function sectionsOf(body) {
  const out = [];
  let at = { heading: '', lines: [] };
  for (const line of body.split(/\r?\n/)) {
    const hd = /^#{1,2}\s+(.+?)\s*#*\s*$/.exec(line);
    if (hd) {
      out.push(at);
      at = { heading: hd[1].slice(0, L.heading), lines: [] };
    } else {
      at.lines.push(line);
    }
  }
  out.push(at);
  return out.map((s) => ({ heading: s.heading, text: s.lines.join('\n').trim() }))
    .filter((s, i) => s.text || (s.heading && i > 0))
    .slice(0, L.sections);
}

export function createWikiTransfer({ wiki, wikiPictures, archive, store }) {
  /**
   * Import a zip of Markdown files. Returns { pages: [{ id, title }], skipped: [{ name, why }], pictures: n }.
   * Pages are the DM's (available 'dm'); a title the wiki already has is skipped, never overwritten.
   */
  async function importZip(cid, buf, { by }) {
    const files = unzip(buf);
    const notes = files.filter((f) => NOTE_EXT.test(f.name));
    if (!notes.length) throw new BadRequestError('There are no Markdown files in that zip.');
    const skipped = [];

    // Pictures first, so the text can point at them: by file name, and by path.
    const pics = new Map();
    for (const f of files.filter((x) => PICTURE_EXT.test(x.name))) {
      try {
        const rec = await wikiPictures.upload(cid, Buffer.from(f.data), { by, name: baseName(f.name) });
        pics.set(f.name.toLowerCase(), rec.id);
        pics.set(path.posix.basename(f.name).toLowerCase(), rec.id);
      } catch (err) {
        skipped.push({ name: f.name, why: err.message });
      }
    }
    const pictureFor = (ref, from) => {
      const r = decodeURIComponent(String(ref).split(/[#?|]/)[0].trim()).replace(/^\.\//, '');
      return pics.get(path.posix.normalize(path.posix.join(path.posix.dirname(from), r)).toLowerCase()) ?? pics.get(r.toLowerCase()) ?? pics.get(path.posix.basename(r).toLowerCase()) ?? null;
    };
    const fixText = (text, from) => text
      // Obsidian's picture embeds ![[map.png]] and Markdown's ![alt](pictures/map.png).
      .replace(/!\[\[([^\]]+?)\]\]/g, (all, ref) => {
        const id = PICTURE_EXT.test(ref.split('|')[0].trim()) && pictureFor(ref, from);
        return id ? `![](picture:${id})` : all;
      })
      .replace(/!\[([^\]\n]*)\]\((?!picture:|https?:)([^)\n]+)\)/g, (all, alt, ref) => {
        const id = pictureFor(ref.replace(/^<|>$/g, ''), from);
        return id ? `![${alt}](picture:${id})` : all;
      })
      // [[Page#Heading]] and [[Page^block]] link the page; [[Page|words]] keeps its words.
      .replace(/\[\[([^\]|#^\n]+)[#^][^\]|\n]*(\|[^\]\n]+)?\]\]/g, (_, name, label) => `[[${name.trim()}${label ?? ''}]]`);

    const taken = new Set(wiki.list(cid).flatMap((p) => [p.title, ...p.aliases]).map(wikiKey));
    const drafts = [];
    for (const f of notes) {
      const { meta, body } = frontMatter(strFromU8(f.data));
      const title = String(meta.title || baseName(f.name)).trim().slice(0, L.title);
      if (!title) continue;
      if (taken.has(wikiKey(title))) {
        skipped.push({ name: f.name, why: `The wiki already has "${title}".` });
        continue;
      }
      taken.add(wikiKey(title));
      const facts = Object.entries(meta)
        .filter(([k, v]) => !META_KEYS.has(k) && (typeof v === 'string' ? v : v.length))
        .map(([k, v]) => ({ label: (k[0].toUpperCase() + k.slice(1)).slice(0, L.label), value: (Array.isArray(v) ? v.join(', ') : v).slice(0, L.value) }))
        .slice(0, L.facts);
      const dir = path.posix.dirname(f.name) === '.' ? '' : path.posix.dirname(f.name);
      drafts.push({
        file: f.name, dir, title,
        kind: String(meta.kind || meta.type || '').slice(0, L.kind),
        tags: asList(meta.tags ?? meta.tag).slice(0, L.tags),
        aliases: asList(meta.aliases ?? meta.alias).filter((a) => !taken.has(wikiKey(a))).slice(0, L.aliases),
        inside: linkName(meta.inside ?? meta.parent),
        facts,
        sections: sectionsOf(fixText(body, f.name)),
      });
    }

    // Folders become "inside": a page in Places/Millbrook/ is inside Millbrook (a note of that name in the folder or
    // beside it), or inside a new page made for the folder.
    const byKey = new Map(drafts.map((d) => [wikiKey(d.title), d]));
    const existing = new Map(wiki.list(cid).map((p) => [wikiKey(p.title), p]));
    for (const d of [...drafts]) {
      if (d.inside) continue;
      // A folder's own note (Millbrook/Millbrook.md) is inside the folder above it.
      const dir = baseName(d.dir) && wikiKey(baseName(d.dir)) === wikiKey(d.title) ? path.posix.dirname(d.dir) : d.dir;
      const folder = dir && dir !== '.' ? baseName(dir) : '';
      if (!folder) continue;
      if (!byKey.has(wikiKey(folder)) && !existing.has(wikiKey(folder))) {
        if (taken.has(wikiKey(folder))) continue;
        taken.add(wikiKey(folder));
        const up = path.posix.dirname(dir);
        const made = { file: `${dir}/`, dir: up === '.' ? '' : up, title: folder.slice(0, L.title), kind: '', tags: [], aliases: [], inside: '', facts: [], sections: [] };
        drafts.push(made);
        byKey.set(wikiKey(folder), made);
        // Its own parent, from the folder above, is worked out when the loop reaches it.
      }
      d.inside = folder;
    }
    // New folder pages are inside the folder above them too.
    for (const d of drafts.filter((x) => x.file.endsWith('/') && !x.inside && x.dir)) {
      const up = baseName(d.dir);
      if (byKey.has(wikiKey(up)) || existing.has(wikiKey(up))) d.inside = up;
    }

    // Parents before the pages inside them; a loop (A inside B inside A) is broken by leaving one at the top.
    const made = new Map();
    const pages = [];
    const make = async (d, seen = new Set()) => {
      const k = wikiKey(d.title);
      if (made.has(k)) return made.get(k);
      let parent = null;
      if (d.inside && !seen.has(k)) {
        const pk = wikiKey(d.inside);
        if (byKey.has(pk) && pk !== k) parent = (await make(byKey.get(pk), new Set([...seen, k])))?.id ?? null;
        else parent = existing.get(pk)?.id ?? null;
      }
      if (made.has(k)) return made.get(k);
      const page = await wiki.create(cid, {
        title: d.title, kind: d.kind, tags: d.tags, aliases: d.aliases, parent, available: 'dm',
        sections: d.sections.map((s) => ({ ...s, available: 'all' })),
        facts: d.facts.map((f) => ({ ...f, available: 'all' })),
      }, { by });
      made.set(k, page);
      pages.push({ id: page.id, title: page.title });
      return page;
    };
    for (const d of drafts) await make(d);
    return { pages, skipped, pictures: new Set(pics.values()).size };
  }

  /** The Markdown for one page: front matter (kind, tags, aliases, inside, facts), then its sections. */
  function pageMarkdown(p, byId, pictureFile) {
    const q = (v) => (/^[\w .'-]*$/.test(v) && !/^\s|\s$/.test(v) ? v : JSON.stringify(v));
    const head = ['---', `title: ${q(p.title)}`];
    if (p.kind) head.push(`kind: ${q(p.kind)}`);
    if (p.tags.length) head.push(`tags: [${p.tags.map(q).join(', ')}]`);
    if (p.aliases.length) head.push(`aliases: [${p.aliases.map(q).join(', ')}]`);
    if (p.parent && byId.has(p.parent)) head.push(`inside: ${JSON.stringify(`[[${byId.get(p.parent).title}]]`)}`);
    for (const f of p.facts) if (f.label && !META_KEYS.has(f.label.toLowerCase())) head.push(`${f.label.replace(/[^\w -]/g, '').trim() || 'Fact'}: ${JSON.stringify(f.value)}`);
    head.push('---', '');
    const pic = (id, alt = '') => (pictureFile(id) ? `![${alt}](${pictureFile(id)})` : '');
    const body = [];
    if (p.picture) body.push(pic(p.picture.id, p.picture.caption), '');
    for (const s of p.sections) {
      if (s.heading) body.push(`## ${s.heading}`, '');
      body.push(s.text.replace(/!\[([^\]\n]*)\]\(picture:([a-f0-9]{10})\)/g, (_, alt, id) => pic(id, alt)).trim(), '');
    }
    if (p.events?.length) body.push('## Events', '', ...p.events.map((e) => `- ${e.when?.text ? `${e.when.text}: ` : ''}${e.text}`), '');
    if (p.gallery?.length) body.push('## Gallery', '', ...p.gallery.map((g) => pic(g.id, g.caption)), '');
    return `${head.join('\n')}${body.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }

  /**
   * A zip of the pages given (as the viewer sees them: wiki.list for the DM, wiki.listFor for a player), each in
   * the folders of the pages it's inside, with the pictures they show in `pictures/`. Returns a Buffer.
   */
  function exportZip(cid, pages) {
    const slug = store.getCampaign(cid).slug;
    const byId = new Map(pages.map((p) => [p.id, p]));
    const files = {};
    const pictures = new Map();
    for (const id of new Set(pages.flatMap(pagePictureIds))) {
      try {
        const r = wikiPictures.get(cid, id);
        const file = `pictures/${id}${path.extname(r.file)}`;
        files[file] = new Uint8Array(fs.readFileSync(archive.wikiPicturePath(slug, r.file)));
        pictures.set(id, file);
      } catch {}
    }
    const safe = (t) => t.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
    const folderOf = (p) => {
      const chain = [];
      for (let at = byId.get(p.parent), n = 0; at && n < 50; at = byId.get(at.parent), n++) chain.unshift(safe(at.title));
      return chain;
    };
    const parents = new Set(pages.map((p) => p.parent).filter((id) => byId.has(id)));
    const used = new Set();
    for (const p of pages) {
      const dirs = folderOf(p);
      // A page with pages inside it is its folder's own note: Millbrook/Millbrook.md.
      if (parents.has(p.id)) dirs.push(safe(p.title));
      const depth = dirs.length;
      let name = [...dirs, `${safe(p.title)}.md`].join('/');
      for (let n = 2; used.has(name.toLowerCase()); n++) name = [...dirs, `${safe(p.title)} (${n}).md`].join('/');
      used.add(name.toLowerCase());
      const rel = (id) => (pictures.has(id) ? `${'../'.repeat(depth)}${pictures.get(id)}` : null);
      files[name] = strToU8(pageMarkdown(p, byId, rel));
    }
    return Buffer.from(zipSync(files, { level: 6 }));
  }

  return { importZip, exportZip };
}
