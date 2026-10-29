export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // A returning visitor is served the previously precached build, so the new one only
  // takes effect after it claims the page. Reload once then.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
