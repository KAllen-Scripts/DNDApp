/** Reading text and form fields out of PDFs (pdf.js, loaded only when needed). */

let pdfjs;
async function open(buf) {
  pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false });
}

/** The PDF's bookmarks, flattened: { title, page (1-based), depth }. Empty if it has none. */
async function readOutline(doc) {
  const out = [];
  async function walk(items, depth) {
    for (const item of items ?? []) {
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        const index = typeof ref === 'number' ? ref : ref ? await doc.getPageIndex(ref) : null;
        if (index != null && item.title?.trim()) out.push({ title: item.title.trim(), page: index + 1, depth });
      } catch {
        // a broken bookmark: skip it
      }
      await walk(item.items, depth + 1);
    }
  }
  await walk(await doc.getOutline(), 0);
  return out;
}

/**
 * @param {Buffer} buf
 * @param {{ maxPages?: number, outline?: boolean }} [opts]
 * @returns {Promise<{ pages: string[], pageCount: number, fields: {name: string, value: string}[], outline: {title: string, page: number, depth: number}[] }>}
 *   pages: each page's text, one line per line of print; fields: filled-in form fields;
 *   outline: the bookmarks (only when asked for).
 */
export async function readPdf(buf, { maxPages = Infinity, outline = false } = {}) {
  const task = await open(buf);
  const doc = await task.promise;
  try {
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      pages.push(items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
      page.cleanup();
    }
    const fields = [];
    for (const [name, objs] of Object.entries((await doc.getFieldObjects()) ?? {})) {
      for (const f of objs) {
        let value = f.value;
        if (f.type === 'checkbox' || f.type === 'radiobutton') value = value && value !== 'Off' ? 'checked' : '';
        if (Array.isArray(value)) value = value.join(', ');
        if (value != null && String(value).trim()) fields.push({ name, value: String(value).trim() });
      }
    }
    return { pages, pageCount: doc.numPages, fields, outline: outline ? await readOutline(doc) : [] };
  } finally {
    await task.destroy();
  }
}
