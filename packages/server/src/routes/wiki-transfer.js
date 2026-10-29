/**
 * Moving the wiki in and out (wiki space stage 9b): import a Markdown or Obsidian zip, or messy notes for the AI to
 * sort (the DM's); export the wiki as a Markdown zip, as the viewer sees it (the DM, `?as=` a player, or a player
 * their own version).
 */
import { z } from 'zod';
import { createWikiTransfer, isZip, docxText } from '../wiki/transfer.js';
import { viewerPagesFor } from './wiki-viewer.js';

const MAX_IMPORT_BYTES = 60 * 1024 * 1024;

export function registerWikiTransfer(app, r) {
  const { access, wiki, wikiAI, wikiPictures, archive, store } = r;
  const transfer = createWikiTransfer({ wiki, wikiPictures, archive, store });
  const viewerPages = viewerPagesFor(r);

  /**
   * Import (DM): { filename, data (base64) } or { text }. A zip of Markdown files becomes pages at once
   * ({ pages, skipped, pictures }); notes (text, Markdown, a Word file) go to the AI, and its pages wait under
   * Waiting ({ proposals }).
   */
  app.post('/campaigns/:cid/wiki/import', { bodyLimit: Math.ceil(MAX_IMPORT_BYTES * 1.4) }, async (request, reply) => {
    const { cid } = access(request, { dm: true });
    const body = z.union([
      z.object({ filename: z.string().max(300).default(''), data: z.string().min(1) }),
      z.object({ text: z.string().min(1).max(2_000_000), filename: z.string().max(300).default('') }),
    ]).parse(request.body ?? {});
    const by = request.user.id;
    let text = body.text;
    if (body.data) {
      const buf = Buffer.from(body.data, 'base64');
      const word = /\.docx$/i.test(body.filename) || isZip(buf) ? docxText(buf) : null;
      if (word != null) {
        text = word;
      } else if (isZip(buf)) {
        const out = await transfer.importZip(cid, buf, { by });
        reply.status(201);
        return out;
      } else {
        text = buf.toString('utf8');
      }
    }
    const made = await wikiAI.importNotes(cid, text, { name: body.filename });
    return { proposals: made.length };
  });

  /** The wiki as a zip of Markdown files, as this viewer sees it (a player: their own version, nothing hidden). */
  app.get('/campaigns/:cid/wiki/export.zip', async (request, reply) => {
    const { cid, as, pages } = viewerPages(request);
    const name = `${store.getCampaign(cid).name || 'wiki'}${as != null ? ' (a player\'s version)' : ''}`.replace(/[^\w ()'-]+/g, '').trim() || 'wiki';
    return reply
      .type('application/zip')
      .header('Content-Disposition', `attachment; filename="${name}.zip"`)
      .header('Cache-Control', 'no-store')
      .send(transfer.exportZip(cid, pages));
  });
}
