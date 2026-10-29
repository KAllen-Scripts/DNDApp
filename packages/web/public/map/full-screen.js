/**
 * Full screen map (the Full screen button on the map's toolbar). The whole
 * page goes full screen, so dialogs, dice and the panel beside the map still
 * work; the top bar hides, the map fills the screen and its toolbars float
 * over it, see-through until you point at them.
 *
 * Only the main tools show (Fit, Measure, Ping, Draw, Template, Initiative,
 * and any tool that's switched on); More shows the rest until the map is
 * touched again.
 *
 * Where the browser can't go full screen (an iPhone, or it says no), the map
 * still fills the window. Escape, or the button again, goes back.
 */
const $ = (sel) => document.querySelector(sel);
const root = document.documentElement;

/** Is the map full screen? */
export const isFull = () => root.hasAttribute('data-map-full');

/** Make the map fill the screen (and the browser go full screen, if it can). */
export async function enterFull() {
  if (isFull()) return;
  root.setAttribute('data-map-full', '');
  renderButton();
  try {
    await root.requestFullscreen?.({ navigationUI: 'hide' });
  } catch { /* not allowed here: the map still fills the window */ }
}

/** Back to the normal page. */
export function leaveFull() {
  if (!isFull()) return;
  root.removeAttribute('data-map-full');
  showMore(false);
  renderButton();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function renderButton() {
  const button = $('#map-full');
  const on = isFull();
  button.textContent = on ? 'Exit full screen' : 'Full screen';
  button.setAttribute('aria-pressed', String(on));
  button.title = on ? 'Back to the normal page (Escape)' : 'Fill the screen with the map; the tools float over it';
}

/** Show or tuck away the rest of the tools (full screen only). */
function showMore(on) {
  $('#map-main-bar').classList.toggle('more-open', on);
  const more = $('#map-more');
  more.setAttribute('aria-expanded', String(on));
  more.textContent = on ? 'Less' : 'More';
}

export function initMapFull() {
  $('#map-full').addEventListener('click', () => (isFull() ? leaveFull() : enterFull()));
  $('#map-more').addEventListener('click', () => showMore(!$('#map-main-bar').classList.contains('more-open')));
  // Back to the main tools once you go back to the map.
  $('#map-view').addEventListener('pointerdown', () => showMore(false));
  renderButton();
  // The browser left full screen (Escape, or its own controls): so does the map.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) leaveFull();
  });
  // Escape when the browser couldn't go full screen. Not while a dialog or a field has it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isFull() || e.defaultPrevented) return;
    if (document.querySelector('dialog[open]') || e.target.closest?.('input, select, textarea')) return;
    leaveFull();
  });
  // Leaving the Map tab (or the campaign) leaves full screen too.
  new MutationObserver(() => {
    if ($('#tab-map').hidden || $('#app-view').hidden) leaveFull();
  }).observe($('#app-view'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // How much room the floating toolbars take, so the turn order and the picked token's bar sit clear of them.
  const bars = $('#tab-map .map-bars');
  new ResizeObserver(() => {
    const panel = $('#tab-map');
    panel.style.setProperty('--bars-h', `${bars.offsetHeight}px`);
    panel.style.setProperty('--bars-w', `${bars.offsetWidth}px`);
  }).observe(bars);
}
