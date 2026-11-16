import { expect, test, vi } from 'vitest';

test('TV options retain controls, adjust selects and return focus on Back', async () => {
  document.body.innerHTML = '<div class="controls"><section id="sound-panel"><select id="voice"><option>A</option><option>B</option></select><button id="sound-toggle">Sound</button></section><section id="find-panel"></section><div id="layers-panel"><button id="row-left">Heatmap</button><select id="wide-select"><option>Auto</option></select><button id="below-left">Activity</button></div></div><span id="sound-state">Off</span>';
  let changes = 0;
  document.getElementById('voice')!.addEventListener('change', () => changes++);
  await import('./webosRemote');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  document.getElementById('tv-settings')!.click();
  expect(document.getElementById('tv-drawer')!.hidden).toBe(false);
  expect(document.getElementById('tv-panel-content')!.contains(document.getElementById('layers-panel'))).toBe(true);
  const rectangles: Record<string, [number, number, number, number]> = {
    'row-left': [0, 100, 150, 44], 'wide-select': [0, 160, 360, 44], 'below-left': [0, 260, 100, 44],
  };
  for (const [id, [left, top, width, height]] of Object.entries(rectangles)) {
    const control = document.getElementById(id)!;
    const rect = { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON() {} };
    control.getBoundingClientRect = () => rect;
    control.getClientRects = () => [rect] as unknown as DOMRectList;
    control.scrollIntoView = vi.fn();
  }
  document.getElementById('row-left')!.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
  expect(document.activeElement?.id).toBe('wide-select');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
  expect(document.activeElement?.id).toBe('below-left');
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
