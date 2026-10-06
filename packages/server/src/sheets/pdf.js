/** Reading text and form fields out of PDFs (pdf.js, loaded only when needed). */

let pdfjs;
async function open(buf) {
  pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false });
}

/**
 * @param {Buffer} buf
 * @param {{ maxPages?: number }} [opts]
 * @returns {Promise<{ pages: string[], pageCount: number, fields: {name: string, value: string}[] }>}
 *   pages: each page's text, one line per line of print; fields: filled-in form fields.
 */
export async function readPdf(buf, { maxPages = Infinity } = {}) {
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
    return { pages, pageCount: doc.numPages, fields };
  } finally {
    await task.destroy();
  }
}
