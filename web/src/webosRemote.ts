import type { LiveMap } from './map';

document.documentElement.dataset.webos = 'true';
let view: LiveMap | undefined;
let pauseFollow = (): void => {};
let mapMode = false;
const panelIDs = ['layers-panel', 'sound-panel', 'find-panel'];
let currentPanel = 'layers-panel';
const dock = document.createElement('nav');
dock.id = 'tv-dock';
dock.setAttribute('aria-label', 'TV remote controls');
dock.innerHTML = '<span id="tv-hint">Arrows: select · OK: activate · Back: move map</span><div>' +
  '<button id="tv-map">Move map</button><button id="tv-home">YKF area</button>' +
  '<button id="tv-out" aria-label="Zoom out">Zoom −</button><button id="tv-in" aria-label="Zoom in">Zoom +</button>' +
  '<button id="tv-follow">Follow</button><button id="tv-sound">Enable sound</button>' +
  '<button id="tv-settings">Options</button></div>';
const drawer = document.createElement('aside');
drawer.id = 'tv-drawer';
drawer.hidden = true;
drawer.setAttribute('role', 'dialog');
drawer.setAttribute('aria-modal', 'true');
drawer.setAttribute('aria-label', 'CartoLite options');
drawer.innerHTML = '<header><strong>Options</strong><button id="tv-close">Close</button></header>' +
  '<div id="tv-tabs"><button id="tv-tab-map">Map &amp; display</button><button id="tv-tab-sound">Sound</button><button id="tv-tab-find">Find</button></div>' +
  '<p class="tv-panel-help">Up/down: navigate · Left/right: adjust · Back: close</p><div id="tv-panel-content"></div>';
document.body.append(dock, drawer);
const button = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
const activate = (id: string): void => { button(id)?.click(); };

function mountPanels(): void {
  const content = document.getElementById('tv-panel-content')!;
  panelIDs.forEach(id => {
    const panel = document.getElementById(id);
    if (panel) { panel.hidden = true; content.appendChild(panel); }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPanels, { once: true });
else mountPanels();

function closeDrawer(): void {
  drawer.hidden = true;
  panelIDs.forEach(id => { const panel = document.getElementById(id); if (panel) panel.hidden = true; });
  button('tv-settings').focus();
}
function openDrawer(id = currentPanel): void {
  currentPanel = id; mapMode = false; dock.dataset.mode = 'menu';
  panelIDs.forEach(panelID => {
    const panel = document.getElementById(panelID);
    if (panel) panel.hidden = panelID !== id;
  });
  drawer.hidden = false;
  const selected = id === 'layers-panel' ? 'map' : id === 'sound-panel' ? 'sound' : 'find';
  ['map', 'sound', 'find'].forEach(tab => button('tv-tab-' + tab).setAttribute('aria-pressed', String(tab === selected)));
  button('tv-tab-' + selected).focus();
  document.getElementById('tv-panel-content')!.scrollTop = 0;
}
function mode(map: boolean): void {
  if (!drawer.hidden) closeDrawer();
  mapMode = map; dock.dataset.mode = map ? 'map' : 'menu';
  document.getElementById('tv-hint')!.textContent = map
    ? 'Arrows: move map · CH +/−: zoom · OK: controls · Back: exit'
    : 'Arrows: select · OK: activate · Back: move map';
  if (map) (document.activeElement as HTMLElement)?.blur();
  else button('tv-sound').focus();
}
button('tv-sound').onclick = () => activate('sound-toggle');
button('tv-follow').onclick = () => activate('follow-button');
button('tv-home').onclick = () => activate('reset-button');
button('tv-in').onclick = () => { pauseFollow(); view?.map.zoomIn({ duration: 180 }); };
button('tv-out').onclick = () => { pauseFollow(); view?.map.zoomOut({ duration: 180 }); };
button('tv-settings').onclick = () => openDrawer();
button('tv-map').onclick = () => mode(true);
button('tv-close').onclick = closeDrawer;
button('tv-tab-map').onclick = () => openDrawer('layers-panel');
button('tv-tab-sound').onclick = () => openDrawer('sound-panel');
button('tv-tab-find').onclick = () => openDrawer('find-panel');
window.addEventListener('cartolite-map-ready', event => {
  const detail = (event as CustomEvent<{ view: LiveMap; pauseFollow: () => void }>).detail;
  view = detail.view; pauseFollow = detail.pauseFollow;
});
const soundState = document.getElementById('sound-state');
if (soundState) new MutationObserver(() => {
  button('tv-sound').textContent = /on/i.test(soundState.textContent ?? '') ? 'Mute sound' : 'Enable sound';
}).observe(soundState, { childList: true, subtree: true, characterData: true });

// Existing panel controls keep their handlers; their website outside-click
// logic must not close a panel that now lives in the dedicated TV drawer.
document.addEventListener('pointerdown', event => {
  if (!drawer.hidden && drawer.contains(event.target as Node)) event.stopImmediatePropagation();
}, true);
function focusNext(dx: number, dy: number): void {
  const active = document.activeElement as HTMLElement;
  const scope = drawer.hidden ? dock : drawer;
  const elements = Array.from(scope.querySelectorAll<HTMLElement>('button, input, select, summary, a[href]'))
    .filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const origin = active?.getBoundingClientRect();
  if (!origin || !elements.includes(active)) { (elements[0] ?? button('tv-settings')).focus(); return; }
  const x = origin.left + origin.width / 2, y = origin.top + origin.height / 2;
  const scored = elements.filter(el => el !== active).map(el => {
    const r = el.getBoundingClientRect(), ox = r.left + r.width / 2 - x, oy = r.top + r.height / 2 - y;
    const forward = dx ? ox * dx : oy * dy;
    return { el, score: forward > 2 ? Math.abs(dx ? oy : ox) * 3 + forward : Infinity };
  }).sort((a, b) => a.score - b.score);
  if (scored[0] && Number.isFinite(scored[0].score)) {
    scored[0].el.focus();
    scored[0].el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
document.addEventListener('keydown', event => {
  const code = event.keyCode;
  const active = document.activeElement as HTMLElement;
  if ([37, 38, 39, 40].includes(code)) {
    const horizontal = code === 37 || code === 39;
    if (active?.tagName === 'INPUT' && horizontal) return;
    if (active?.tagName === 'SELECT' && horizontal) {
      event.preventDefault(); event.stopImmediatePropagation();
      const select = active as HTMLSelectElement;
      select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + (code === 39 ? 1 : -1)));
      select.dispatchEvent(new Event('change', { bubbles: true })); return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    const dx = code === 37 ? -1 : code === 39 ? 1 : 0, dy = code === 38 ? -1 : code === 40 ? 1 : 0;
    if (mapMode) { pauseFollow(); view?.map.panBy([dx * 100, dy * 100], { duration: 160 }); }
    else focusNext(dx, dy);
  } else if (code === 13) {
    if (active?.tagName === 'INPUT' && (active as HTMLInputElement).type !== 'range') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (mapMode) mode(false); else if (active?.tagName !== 'SELECT') active?.click();
  } else if (code === 461 || code === 27) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!drawer.hidden) { closeDrawer(); return; }
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog) { dialog.close(); mode(false); return; }
    if (!mapMode) mode(true); else window.close();
  } else if (code === 427 || code === 428) {
    event.preventDefault(); activate(code === 427 ? 'tv-in' : 'tv-out');
  } else if (code >= 403 && code <= 406) {
    event.preventDefault(); activate(['tv-sound', 'tv-follow', 'tv-home', 'tv-settings'][code - 403]!);
  }
}, true);
document.addEventListener('click', event => {
  const link = (event.target as Element)?.closest('a[href]');
  if (link && (link as HTMLAnchorElement).getAttribute('href')) event.preventDefault();
});
button('tv-sound').focus();
