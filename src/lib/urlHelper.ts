/**
 * Helper functions to generate and parse public review URLs consistently
 * across all browsers, mobile devices, and iframe environments.
 */

export function getPublicReviewUrl(slugOrId: string): string {
  if (!slugOrId) return window.location.origin;

  const origin = window.location.origin;
  // Ensure pathname ends with a slash if query parameter is appended directly
  let pathname = window.location.pathname;
  if (!pathname.endsWith('/')) {
    pathname = pathname + '/';
  }

  const clean = slugOrId.trim();
  return `${origin}${pathname}?b=${encodeURIComponent(clean)}`;
}

export function extractReviewSlug(): string | null {
  try {
    // 1. Search query parameters in search string (?b=... or ?review=... or ?id=...)
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch =
      searchParams.get('b') ||
      searchParams.get('review') ||
      searchParams.get('id') ||
      searchParams.get('slug');

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
          hashParams.get('review') ||
          hashParams.get('id') ||
          hashParams.get('slug');
        if (fromHashQuery && fromHashQuery.trim()) {
          return decodeURIComponent(fromHashQuery.trim());
        }
      }

      const pathSegments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      if (
        (pathSegments[0] === 'r' || pathSegments[0] === 'review' || pathSegments[0] === 'b') &&
        pathSegments[1]
      ) {
        return decodeURIComponent(pathSegments[1].trim());
      }
    }

    // 3. Pathname routing (/r/:slug or /review/:slug or /b/:slug)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (
      (pathParts[0] === 'r' || pathParts[0] === 'review' || pathParts[0] === 'b') &&
      pathParts[1]
    ) {
      return decodeURIComponent(pathParts[1].trim());
    }
  } catch (err) {
    console.warn('Error extracting review slug:', err);
  }

  return null;
}
