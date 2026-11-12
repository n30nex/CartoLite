import { afterEach, expect, it } from 'vitest';
import { rememberNode, replaceInspector } from './selection';

afterEach(() => {document.body.replaceChildren();history.replaceState(null,'','/');});

it('carries the selected public node through both Fly 3D entry links', () => {
  document.body.innerHTML='<nav class="dock-views"><a href="/fly-3d/">Fly</a><a href="/netgraph/">Graph</a><a href="/labs/">Labs</a></nav><a id="fly-map-link" href="/fly-3d/?scope=YYZ">Fly from terrain</a>';
  rememberNode('public-node');
  expect(document.querySelector('.dock-views a')!.getAttribute('href')).toBe('/fly-3d/?node=public-node');
  expect(document.querySelector('#fly-map-link')!.getAttribute('href')).toBe('/fly-3d/?scope=YYZ&node=public-node');
  expect(document.querySelector('a[href="/labs/"]')).not.toBeNull();
  rememberNode(null);
  expect(document.querySelector('#fly-map-link')!.getAttribute('href')).toBe('/fly-3d/?scope=YYZ');
});

it('retains a focused connection when live updates reorder the chooser', () => {
  const host = document.createElement('aside'); document.body.append(host);
  const content = (ids: string[]) => {
    const root = document.createElement('section');
    root.innerHTML = '<button aria-label="Close">×</button>';
    for (const id of ids) {
      const button = document.createElement('button'); button.dataset.routeId = id;
      button.textContent = id; root.append(button);
    }
    return root;
  };
  replaceInspector(host, content(['a-b', 'b-c']));
  host.querySelector<HTMLButtonElement>('[data-route-id="b-c"]')!.focus();
  replaceInspector(host, content(['b-c', 'a-b']));
  expect((document.activeElement as HTMLElement).dataset.routeId).toBe('b-c');
  replaceInspector(host, content(['a-b']));
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
});
