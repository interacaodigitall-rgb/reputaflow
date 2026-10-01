/**
 * Helper functions to generate and parse public review URLs and NFC plate URLs
 * consistently across desktop, mobile devices, QR code scanners, and preview environments.
 */

export function getPublicReviewUrl(slugOrId: string): string {
  if (!slugOrId) return typeof window !== 'undefined' ? window.location.origin : '';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  
  // Clean pathname so we never get double slashes like 'https://site.com//?b=slug'
  const cleanPath = pathname === '/' ? '' : pathname.replace(/\/+$/, '');
  const clean = slugOrId.trim();

  return `${origin}${cleanPath}/?b=${encodeURIComponent(clean)}`;
}

export function getNfcRedirectUrl(plateId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const cleanId = (plateId || '').trim();
  return `${origin}/qr/${encodeURIComponent(cleanId)}`;
}

export function extractReviewSlug(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Search query parameters in search string (?b=... or ?business=... or ?review=... or ?slug=...)
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch =
      searchParams.get('b') ||
      searchParams.get('business') ||
      searchParams.get('review') ||
      searchParams.get('slug') ||
      searchParams.get('id');

    if (fromSearch && fromSearch.trim()) {
      return decodeURIComponent(fromSearch.trim());
    }

    // 2. Hash query or hash path (#?b=... or #/r/... or #/review/...)
    if (window.location.hash) {
      const hash = window.location.hash;
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(qIndex));
        const fromHashQuery =
          hashParams.get('b') ||
          hashParams.get('business') ||
          hashParams.get('review') ||
          hashParams.get('slug') ||
          hashParams.get('id');
        if (fromHashQuery && fromHashQuery.trim()) {
          return decodeURIComponent(fromHashQuery.trim());
        }
      }

      const pathSegments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      if (
        (pathSegments[0] === 'r' || pathSegments[0] === 'review' || pathSegments[0] === 'b' || pathSegments[0] === 'business') &&
        pathSegments[1]
      ) {
        return decodeURIComponent(pathSegments[1].trim());
      }
    }

    // 3. Pathname routing (/r/:slug or /review/:slug or /b/:slug or /business/:slug)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (
      (pathParts[0] === 'r' || pathParts[0] === 'review' || pathParts[0] === 'b' || pathParts[0] === 'business') &&
      pathParts[1]
    ) {
      return decodeURIComponent(pathParts[1].trim());
    }
  } catch (err) {
    console.warn('Error extracting review slug:', err);
  }

  return null;
}

export function extractNfcPlateId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Pathname routing (/qr/:id or /nfc/:id)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if ((pathParts[0] === 'qr' || pathParts[0] === 'nfc') && pathParts[1]) {
      return decodeURIComponent(pathParts[1].trim());
    }

    // 2. Query parameter (?qr=001 or ?nfc=001 or ?nfc_id=001)
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch =
      searchParams.get('qr') ||
      searchParams.get('nfc') ||
      searchParams.get('nfc_id') ||
      searchParams.get('plate');

    if (fromSearch && fromSearch.trim()) {
      return decodeURIComponent(fromSearch.trim());
    }

    // 3. Hash routing (#/qr/:id or #/nfc/:id or #?qr=001)
    if (window.location.hash) {
      const hash = window.location.hash;
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(qIndex));
        const fromHashQuery =
          hashParams.get('qr') ||
          hashParams.get('nfc') ||
          hashParams.get('nfc_id') ||
          hashParams.get('plate');
        if (fromHashQuery && fromHashQuery.trim()) {
          return decodeURIComponent(fromHashQuery.trim());
        }
      }

      const pathSegments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      if ((pathSegments[0] === 'qr' || pathSegments[0] === 'nfc') && pathSegments[1]) {
        return decodeURIComponent(pathSegments[1].trim());
      }
    }
  } catch (err) {
    console.warn('Error extracting NFC plate ID:', err);
  }

  return null;
}
