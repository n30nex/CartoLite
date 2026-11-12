import type { LiveMap } from './map';
import type { PacketAnimator } from './packetAnimator';
import { mapFlight } from './mapFlight';

// Like Terminal, this entry precedes the existing Map owner: one map and feed.
window.addEventListener('cartolite-map-ready', event => {
  if (!document.documentElement.hasAttribute('data-fly3d')) return;
  const { view, animator, pauseFollow, refreshControls } = (event as CustomEvent<{
    view: LiveMap; animator: PacketAnimator; pauseFollow?: () => void; refreshControls?: () => void;
  }>).detail;
  const flight = mapFlight(view, animator, { pauseFollow, refreshControls, changed: () => view.map.triggerRepaint() }, 'map');
  const destroy = () => flight.destroy();
  view.map.on('remove', destroy);
  window.addEventListener('pagehide', event => { if (!event.persisted) destroy(); });
}, { once: true });
