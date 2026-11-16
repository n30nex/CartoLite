import type { LiveMap } from './map';

document.documentElement.dataset.webos = 'true';
let view: LiveMap | undefined;
let pauseFollow = (): void => {};
let mapMode = false;
const dock = document.createElement('nav');
dock.id = 'tv-dock';
dock.setAttribute('aria-label', 'TV remote controls');
dock.innerHTML = '<span id="tv-hint">OK: live sound · Arrows: select · Back: map</span><div>' +
  '<button id="tv-sound">Enable live sound</button><button id="tv-follow">Live Follow</button>' +
  '<button id="tv-home">Canada</button><button id="tv-out">Zoom −</button>' +
  '<button id="tv-in">Zoom +</button><button id="tv-settings">Settings</button>' +
  '<button id="tv-map">Move map</button></div>';
document.body.appendChild(dock);
const button = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
const activate = (id: string): void => { button(id)?.click(); };
function mode(map: boolean): void {
  mapMode = map;
  dock.dataset.mode = map ? 'map' : 'menu';
  document.getElementById('tv-hint')!.textContent = map
    ? 'Arrows: move map · CH +/−: zoom · OK: menu · Back: exit'
    : 'Arrows: select · OK: activate · Back: map · CH +/−: zoom';
  if (map) (document.activeElement as HTMLElement)?.blur();
  else button('tv-sound').focus();
}
button('tv-sound').onclick = () => activate('sound-toggle');
button('tv-follow').onclick = () => activate('follow-button');
button('tv-home').onclick = () => activate('reset-button');
button('tv-in').onclick = () => { pauseFollow(); view?.map.zoomIn(); };
button('tv-out').onclick = () => { pauseFollow(); view?.map.zoomOut(); };
button('tv-settings').onclick = () => { activate('layers-summary'); button('layers-close')?.focus(); };
button('tv-map').onclick = () => mode(true);
window.addEventListener('cartolite-map-ready', (event) => {
  const detail = (event as CustomEvent<{ view: LiveMap; pauseFollow: () => void }>).detail;
  view = detail.view; pauseFollow = detail.pauseFollow;
  // Keep browser backing buffers at TV UI resolution instead of 4K supersampling.
  view.map.setPixelRatio(1);
});
const soundState = document.getElementById('sound-state');
if (soundState) new MutationObserver(() => {
  const text = soundState.textContent ?? '';
  button('tv-sound').textContent = /on/i.test(text) ? 'Mute live sound' : 'Enable live sound';
}).observe(soundState, { childList: true, subtree: true, characterData: true });

function focusNext(dx: number, dy: number): void {
  const active = document.activeElement as HTMLElement;
  const origin = active?.getBoundingClientRect();
  const elements = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, summary, a[href]'))
    .filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  if (!origin || !elements.includes(active)) { button('tv-sound').focus(); return; }
  const x = origin.left + origin.width / 2, y = origin.top + origin.height / 2;
  const scored = elements.filter(el => el !== active).map(el => {
    const r = el.getBoundingClientRect(), ox = r.left + r.width / 2 - x, oy = r.top + r.height / 2 - y;
    const forward = dx ? ox * dx : oy * dy;
    return { el, score: forward > 2 ? Math.abs(dx ? oy : ox) * 3 + forward : Infinity };
  }).sort((a, b) => a.score - b.score);
  if (scored[0] && Number.isFinite(scored[0].score)) {
    scored[0].el.focus(); scored[0].el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
document.addEventListener('keydown', (event) => {
  const code = event.keyCode;
  const active = document.activeElement as HTMLElement;
  if ((active?.tagName === 'INPUT' && (active as HTMLInputElement).type !== 'range') || active?.tagName === 'SELECT') {
    if (code !== 461 && code !== 27) return;
  }
  if ([37, 38, 39, 40].includes(code)) {
    if (active?.tagName === 'INPUT') return; // Native range control.
    event.preventDefault(); event.stopImmediatePropagation();
    const dx = code === 37 ? -1 : code === 39 ? 1 : 0, dy = code === 38 ? -1 : code === 40 ? 1 : 0;
    if (mapMode) { pauseFollow(); view?.map.panBy([dx * 150, dy * 150], { duration: 220 }); }
    else focusNext(dx, dy);
  } else if (code === 13) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (mapMode) mode(false); else active?.click();
  } else if (code === 461 || code === 27) {
    event.preventDefault(); event.stopImmediatePropagation();
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog) { dialog.close(); mode(false); return; }
    const panels = ['sound-panel', 'find-panel'];
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
    if (!document.getElementById('layers-panel')?.hidden) activate('layers-close');
    if (!mapMode) mode(true); else window.close();
  } else if (code === 427 || code === 428) {
    event.preventDefault(); activate(code === 427 ? 'tv-in' : 'tv-out');
  } else if (code >= 403 && code <= 406) {
    event.preventDefault(); activate(['tv-sound', 'tv-follow', 'tv-home', 'tv-settings'][code - 403]!);
  }
}, true);
// Packaged mode has one map; prevent links from navigating out of the app.
document.addEventListener('click', event => {
  const link = (event.target as Element)?.closest('a[href]');
  if (link && (link as HTMLAnchorElement).getAttribute('href')) event.preventDefault();
});
button('tv-sound').focus();
