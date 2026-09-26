import { extractReviewSlug } from './urlHelper';

/**
 * Manages PWA and ensures no stale service worker or HTTP caches intercept live database data
 */
export function initConditionalPWA() {
  if (typeof window === 'undefined') return;

  const isReviewPage = !!extractReviewSlug();

  if (isReviewPage) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      }).catch(() => {});
    }

    const existingManifest = document.getElementById('pwa-manifest-link');
    if (existingManifest) {
      existingManifest.remove();
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
    });

    return;
  }

  // On main CRM / admin app, ensure manifest is present
  if (!document.getElementById('pwa-manifest-link')) {
    const link = document.createElement('link');
    link.id = 'pwa-manifest-link';
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  // Register service worker for installed PWA support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}
