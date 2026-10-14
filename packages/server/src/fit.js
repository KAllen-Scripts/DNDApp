/**
 * Tool results for the AIs, up to a size budget, built from whole pieces
 * (records, transcript chunks, list lines). Nothing is ever cut in the
 * middle: the first piece always comes whole, even past the budget, and the
 * pieces that don't fit are named at the end so the model can ask for them.
 */

/**
 * @template T
 * @param {T[]} items  in the order to show them (best first)
 * @param {number} maxChars
 * @param {object} o
 * @param {(item: T) => string} [o.render]
 * @param {string} [o.sep]
 * @param {(left: T[]) => string} [o.leftOver]  a note naming what didn't fit
 * @returns {{ text: string, shown: T[], left: T[] }}
 */
export function fitWhole(items, maxChars, { render = String, sep = '\n\n---\n\n', leftOver } = {}) {
  const parts = [];
  const shown = [];
  let used = 0;
  let i = 0;
  for (; i < items.length; i++) {
    const text = render(items[i]);
    const size = text.length + (parts.length ? sep.length : 0);
    if (parts.length && used + size > maxChars) break;
    parts.push(text);
    shown.push(items[i]);
    used += size;
  }
  const left = items.slice(i);
  const note = left.length && leftOver ? `\n\n${leftOver(left)}` : '';
  return { text: parts.join(sep) + note, shown, left };
}
