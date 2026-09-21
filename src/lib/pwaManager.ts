import { extractReviewSlug } from './urlHelper';

let isPwaInitialized = false;

/**
 * Conditionally manages the PWA manifest and Service Worker registration.
 * - If the URL contains ?b= (public customer review page), PWA manifest is omitted
 *   and install prompts are suppressed.
 * - If the URL is the main app/CRM (/), manifest is injected and Service Worker is registered.
 */
export function initConditionalPWA() {
  if (typeof window === 'undefined') return;

  const isReviewPage = !!extractReviewSlug();

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

  // If on main CRM / admin app, inject manifest and register Service Worker
  if (!document.getElementById('pwa-manifest-link')) {
    const link = document.createElement('link');
    link.id = 'pwa-manifest-link';
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  // Register service worker if supported
  if ('serviceWorker' in navigator && !isPwaInitialized) {
    isPwaInitialized = true;
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('ReputaFlow PWA Service Worker active:', reg.scope);
        })
        .catch((err) => {
          console.warn('ReputaFlow Service Worker registration skipped:', err);
        });
    });
  }
}
