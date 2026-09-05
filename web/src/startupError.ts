import './startupError.css';

export function showStartupError(container: HTMLElement, view: string, error: unknown): void {
  console.warn(`Could not load ${view}:`, error instanceof Error ? error.message : 'Startup failed');
  const message = document.createElement('span');
  message.textContent = `Unable to load ${view}. Check your connection, then try again.`;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'startup-retry';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => window.location.reload());
  container.replaceChildren(message, retry);
  container.hidden = false;
}
