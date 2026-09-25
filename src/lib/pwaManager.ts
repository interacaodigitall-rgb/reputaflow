import { extractReviewSlug } from './urlHelper';

/**
 * Manages PWA and ensures no stale service worker or HTTP caches intercept live database data
 */
export function initConditionalPWA() {
  if (typeof window === 'undefined') return;

  const isReviewPage = !!extractReviewSlug();

  // Clear any existing stale service worker and caches to ensure 100% sync between devices
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    }).catch(() => {});

    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      }).catch(() => {});
    }
  }

  // If on public review page, ensure manifest is NOT in head and suppress install prompt
  if (isReviewPage) {
    const existingManifest = document.getElementById('pwa-manifest-link');
    if (existingManifest) {
      existingManifest.remove();
    }

    // Suppress any ambient install prompt on review page
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
    });

    return;
  }

  // If on main CRM / admin app, inject manifest
  if (!document.getElementById('pwa-manifest-link')) {
    const link = document.createElement('link');
    link.id = 'pwa-manifest-link';
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }
}
