import { expect, test } from 'vitest';

test('TV options retain controls, adjust selects and return focus on Back', async () => {
  document.body.innerHTML = '<div class="controls"><section id="sound-panel"><select id="voice"><option>A</option><option>B</option></select><button id="sound-toggle">Sound</button></section><section id="find-panel"></section><div id="layers-panel"></div></div><span id="sound-state">Off</span>';
  let changes = 0;
  document.getElementById('voice')!.addEventListener('change', () => changes++);
  await import('./webosRemote');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  document.getElementById('tv-settings')!.click();
  expect(document.getElementById('tv-drawer')!.hidden).toBe(false);
  expect(document.getElementById('tv-panel-content')!.contains(document.getElementById('layers-panel'))).toBe(true);
  document.getElementById('tv-tab-sound')!.click();
  expect(document.getElementById('sound-panel')!.hidden).toBe(false);
  expect(document.getElementById('layers-panel')!.hidden).toBe(true);
  const voice = document.getElementById('voice') as HTMLSelectElement;
  voice.focus();
  voice.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
  expect(voice.selectedIndex).toBe(1);
  expect(changes).toBe(1);
  voice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 461, bubbles: true }));
  expect(document.getElementById('tv-drawer')!.hidden).toBe(true);
  expect(document.activeElement?.id).toBe('tv-settings');
});
