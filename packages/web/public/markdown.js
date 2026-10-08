/**
 * Markdown (with some HTML) from the AI or the archivist -> safe HTML, the
 * same way everywhere: answers, stat blocks, records. The text can quote
 * transcripts or the web, so it's never trusted: nothing that runs, loads,
 * links out or restyles the page gets through.
 */
import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';

const SAFE_HTML = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'small', 'sub', 'sup', 'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    'div', 'span', 'section', 'details', 'summary',
  ],
  ALLOWED_ATTR: ['class', 'colspan', 'rowspan', 'scope', 'align', 'start', 'open'],
};

// Markdown that's still streaming can end mid-table or mid-tag; marked and the sanitiser cope with both.
marked.use({ gfm: true, breaks: true });

/** Markdown -> a sanitised DocumentFragment. */
export const markdownFragment = (text) => DOMPurify.sanitize(marked.parse(text.trim()), { ...SAFE_HTML, RETURN_DOM_FRAGMENT: true });

/** An element showing markdown, sanitised. */
export function markdownBox(text, attrs = {}) {
  const box = document.createElement('div');
  for (const [k, v] of Object.entries(attrs)) box.setAttribute(k, v);
  box.append(markdownFragment(text));
  return box;
}
