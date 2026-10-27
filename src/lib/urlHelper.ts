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
  const cleanId = (plateId || '').trim();
  let origin = '';
  
  if (typeof window !== 'undefined' && window.location) {
    origin = window.location.origin || `${window.location.protocol}//${window.location.host}`;
  }
  
  const cleanOrigin = origin ? origin.replace(/\/+$/, '') : '';
  return `${cleanOrigin}/qr/${encodeURIComponent(cleanId)}`;
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
    // 1. Pathname routing (/qr/:id, /qrc/:id or /nfc/:id)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if ((pathParts[0] === 'qr' || pathParts[0] === 'qrc' || pathParts[0] === 'nfc') && pathParts[1]) {
      return decodeURIComponent(pathParts[1].trim());
    }

    // 2. Query parameter (?qr=001 or ?nfc=001 or ?nfc_id=001)
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch =
      searchParams.get('qr') ||
      searchParams.get('qrc') ||
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
          hashParams.get('qrc') ||
          hashParams.get('nfc') ||
          hashParams.get('nfc_id') ||
          hashParams.get('plate');
        if (fromHashQuery && fromHashQuery.trim()) {
          return decodeURIComponent(fromHashQuery.trim());
        }
      }

      const pathSegments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      if ((pathSegments[0] === 'qr' || pathSegments[0] === 'qrc' || pathSegments[0] === 'nfc') && pathSegments[1]) {
        return decodeURIComponent(pathSegments[1].trim());
      }
    }
  } catch (err) {
    console.warn('Error extracting NFC plate ID:', err);
  }

  return null;
}

/**
 * Normalizes and slugifies any business name into a URL-friendly, lowercase string.
 * Example: "Churrascaria Picanha na Brasa & Cia!" -> "churrascaria-picanha-na-brasa-cia"
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // remove caracteres não alfanuméricos
    .replace(/\s+/g, '-') // substitui espaços por hífens
    .replace(/-+/g, '-') // múltiplos hífens viram um único
    .replace(/^-+|-+$/g, ''); // apara hífens nas extremidades
}

/**
 * Extracts a Google Place ID (e.g., 'ChIJN1t_tDeuEmsRUsoyG83frY4') from raw strings,
 * URLs, or parameters.
 */
export function extractGooglePlaceId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();

  // 1. Direct Place ID match (Standard Google Place ID format begins with ChIJ, 20-50 chars)
  const directMatch = clean.match(/^(?:place_id:)?(ChIJ[a-zA-Z0-9_-]{20,50})$/i);
  if (directMatch) return directMatch[1];

  // 2. Query parameter: placeid=... or place_id=... or query_place_id=...
  const queryParamMatch = clean.match(/(?:placeid|place_id|query_place_id)[=:](ChIJ[a-zA-Z0-9_-]{20,50})/i);
  if (queryParamMatch) return queryParamMatch[1];

  // 3. Embedded in URL path or data block (!1s... or /place_id:...)
  const embeddedMatch = clean.match(/(?:place_id:|placeid:|\/)(ChIJ[a-zA-Z0-9_-]{20,50})/i);
  if (embeddedMatch) return embeddedMatch[1];

  // 4. Any occurrence of a 27-character ChIJ string in the input
  const anyChij = clean.match(/\b(ChIJ[a-zA-Z0-9_-]{20,50})\b/);
  if (anyChij) return anyChij[1];

  return null;
}

/**
 * Extracts Google CID (hex or decimal) from a Google Maps URL if present.
 */
export function extractGoogleCid(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();

  // Decimal CID: cid=123456789012345
  const decimalMatch = clean.match(/[?&]cid=(\d+)/i);
  if (decimalMatch) return decimalMatch[1];

  // Hexadecimal feature ID in data=!4m...: 1s0x...:0x([0-9a-fA-F]+)
  const hexMatch = clean.match(/1s0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/i);
  if (hexMatch) {
    try {
      return BigInt('0x' + hexMatch[1]).toString();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Generates the official, direct Google write-review URL from a Place ID.
 */
export function buildGoogleWriteReviewUrl(placeId: string): string {
  const cleanId = (placeId || '').trim().replace(/^place_id:/i, '');
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(cleanId)}`;
}

export interface GoogleReviewUrlNormalization {
  url: string;
  placeId?: string;
  cid?: string;
  isOptimized: boolean;
  detectedType: 'official_writereview' | 'place_id' | 'g_page' | 'maps_with_placeid' | 'maps_with_cid' | 'maps_generic' | 'standard_url' | 'empty';
  message: string;
}

/**
 * Normalizes any Google Review / Maps input into the most direct review URL possible.
 * Prioritizes 'https://search.google.com/local/writereview?placeid=...'.
 */
export function normalizeGoogleReviewUrl(input: string): GoogleReviewUrlNormalization {
  if (!input || !input.trim()) {
    return {
      url: '',
      isOptimized: false,
      detectedType: 'empty',
      message: 'Nenhum link fornecido.'
    };
  }

  let clean = input.trim();

  // If already official write-review URL
  if (clean.includes('search.google.com/local/writereview')) {
    const placeId = extractGooglePlaceId(clean);
    return {
      url: clean.startsWith('http') ? clean : `https://${clean}`,
      placeId: placeId || undefined,
      isOptimized: true,
      detectedType: 'official_writereview',
      message: 'Link oficial do Google Reviews verificado.'
    };
  }

  // Check if user pasted a raw Place ID
  const rawPlaceId = extractGooglePlaceId(clean);
  if (rawPlaceId && !clean.includes('google.com') && !clean.includes('http')) {
    const officialUrl = buildGoogleWriteReviewUrl(rawPlaceId);
    return {
      url: officialUrl,
      placeId: rawPlaceId,
      isOptimized: true,
      detectedType: 'place_id',
      message: `Place ID (${rawPlaceId}) convertido para o link oficial de avaliação.`
    };
  }

  // Check if it's a g.page short link (Google Business Profile)
  if (clean.includes('g.page/')) {
    let gPageUrl = clean.startsWith('http') ? clean : `https://${clean}`;
    if (!gPageUrl.endsWith('/review') && !gPageUrl.includes('/review?')) {
      gPageUrl = gPageUrl.replace(/\/+$/, '') + '/review';
    }
    return {
      url: gPageUrl,
      isOptimized: true,
      detectedType: 'g_page',
      message: 'Link de perfil comercial Google (g.page) otimizado com sufixo /review.'
    };
  }

  // Check if Place ID is embedded in a Google Maps URL
  if (rawPlaceId) {
    const officialUrl = buildGoogleWriteReviewUrl(rawPlaceId);
    return {
      url: officialUrl,
      placeId: rawPlaceId,
      isOptimized: true,
      detectedType: 'maps_with_placeid',
      message: 'Place ID extraído do link do Maps e convertido no link de review direto.'
    };
  }

  // Check if CID is present in Maps URL
  const cid = extractGoogleCid(clean);
  if (cid) {
    const cidUrl = `https://maps.google.com/?cid=${cid}`;
    return {
      url: cidUrl,
      cid,
      isOptimized: true,
      detectedType: 'maps_with_cid',
      message: 'Identificador CID extraído com sucesso do link do Google Maps.'
    };
  }

  // If it's a maps.app.goo.gl or generic maps URL without exposed Place ID
  if (clean.includes('maps.app.goo.gl') || clean.includes('goo.gl/maps') || clean.includes('google.com/maps')) {
    const validUrl = clean.startsWith('http') ? clean : `https://${clean}`;
    return {
      url: validUrl,
      isOptimized: false,
      detectedType: 'maps_generic',
      message: 'Link do Maps detetado. Utilize o botão "Converter Link do Maps" para resolver o Place ID oficial.'
    };
  }

  // Standard generic URL
  const standardUrl = clean.startsWith('http') ? clean : `https://${clean}`;
  return {
    url: standardUrl,
    isOptimized: false,
    detectedType: 'standard_url',
    message: 'Link padrão formatado.'
  };
}

/**
 * Resolves short Google Maps links (e.g. maps.app.goo.gl) and extracts the official
 * Google Write-Review URL via the backend API.
 */
export async function convertGoogleMapsToReviewUrl(
  input: string
): Promise<{ success: boolean; reviewUrl: string; placeId?: string; originalUrl: string; message: string }> {
  if (!input || !input.trim()) {
    return {
      success: false,
      reviewUrl: '',
      originalUrl: '',
      message: 'Por favor, insira um link do Google Maps ou Place ID.'
    };
  }

  const clean = input.trim();

  // 1. Fast path: check if local normalization already finds Place ID or official format
  const localNorm = normalizeGoogleReviewUrl(clean);
  if (localNorm.isOptimized && localNorm.detectedType !== 'maps_generic') {
    return {
      success: true,
      reviewUrl: localNorm.url,
      placeId: localNorm.placeId,
      originalUrl: clean,
      message: localNorm.message
    };
  }

  // 2. Server-side resolution for short links (maps.app.goo.gl, goo.gl/maps, etc.)
  try {
    const response = await fetch('/api/convert-google-review-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: clean })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.success && data.reviewUrl) {
        return {
          success: true,
          reviewUrl: data.reviewUrl,
          placeId: data.placeId,
          originalUrl: clean,
          message: data.message || 'Link do Google Maps convertido com sucesso para o formato oficial!'
        };
      }
    }
  } catch (err) {
    console.warn('[convertGoogleMapsToReviewUrl server call failed, falling back]:', err);
  }

  // 3. Fallback: return the local normalized URL
  return {
    success: true,
    reviewUrl: localNorm.url,
    placeId: localNorm.placeId,
    originalUrl: clean,
    message: localNorm.message || 'Link processado.'
  };
}

/**
 * Extracts a tenant/business slug from any internal redirect URL (e.g. '/?b=mrnavalha', '/r/mrnavalha').
 */
export function extractSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.trim();
  const matchQuery = clean.match(/[?&](?:b|business|review|slug|id)=([^&#]+)/i);
  if (matchQuery && matchQuery[1]) return decodeURIComponent(matchQuery[1].trim());
  const matchPath = clean.match(/(?:\/r\/|\/review\/|\/b\/|\/business\/)([^/?#]+)/i);
  if (matchPath && matchPath[1]) return decodeURIComponent(matchPath[1].trim());
  return null;
}

/**
 * Compares two QR/NFC plate codes (e.g. 'QRC0004' vs '004' vs '#004' vs 'NFC-004' vs '4').
 */
export function isSamePlateCode(aRaw: string | null | undefined, bRaw: string | null | undefined): boolean {
  const a = String(aRaw || '').trim().toUpperCase().replace(/^#+/, '');
  const b = String(bRaw || '').trim().toUpperCase().replace(/^#+/, '');
  if (!a || !b) return false;
  if (a === b) return true;
  const aStrip = a.replace(/^(?:QRC|NFC|QR|PLATE|PLACA)[-_]?/i, '');
  const bStrip = b.replace(/^(?:QRC|NFC|QR|PLATE|PLACA)[-_]?/i, '');
  if (aStrip && bStrip && aStrip === bStrip) return true;
  const aDigits = a.replace(/\D/g, '').replace(/^0+/, '');
  const bDigits = b.replace(/\D/g, '').replace(/^0+/, '');
  if (aDigits && bDigits && aDigits === bDigits) return true;
  return false;
}

/**
 * Helper to determine if a plate row has an assigned merchant/tenant target and is not inactive.
 */
export function isPlateAssignedAndActive(p: Record<string, any> | null | undefined): boolean {
  if (!p) return false;
  const joinedSlug =
    p.tenants?.slug ||
    (Array.isArray(p.tenants) ? p.tenants[0]?.slug : null) ||
    p.businesses?.slug ||
    (Array.isArray(p.businesses) ? p.businesses[0]?.slug : null) ||
    p.establishments?.slug ||
    (Array.isArray(p.establishments) ? p.establishments[0]?.slug : null);

  const hasTarget = Boolean(
    p.redirect_url ||
    p.redirectUrl ||
    p.merchant_id ||
    p.merchantId ||
    p.tenant_id ||
    p.tenantId ||
    p.business_id ||
    p.establishment_id ||
    p.merchant_slug ||
    p.merchantSlug ||
    joinedSlug
  );

  if (!hasTarget) return false;

  const rawStatus = String(p.status || '').trim().toLowerCase();
  // Active if status is 'active' OR if status column is omitted/null (like in qr_plates) and not explicitly 'inactive'
  return rawStatus === 'active' || (rawStatus !== 'inactive' && rawStatus !== 'unlinked' && rawStatus !== 'disabled');
}

/**
 * Finds the best matching plate from a list of plates for a given code (e.g. 'QRC0004'),
 * strictly prioritizing active/linked plates, custom merchant assignments, exact code matches, and newest timestamps.
 */
export function findBestMatchingPlate<T extends Record<string, any>>(plates: T[], targetCode: string): T | null {
  const cleanTarget = String(targetCode || '').trim().toUpperCase().replace(/^#+/, '');
  if (!cleanTarget || !Array.isArray(plates) || plates.length === 0) return null;

  const candidates = plates.filter((p) => {
    if (!p) return false;
    const pId = p.id || p.qr_code_id || p.code || p.plate_code || '';
    const pQr = p.qr_code_id || p.code || '';
    return isSamePlateCode(pId, cleanTarget) || (pQr && isSamePlateCode(pQr, cleanTarget));
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return candidates.sort((a, b) => {
    const aActive = isPlateAssignedAndActive(a) ? 1 : 0;
    const bActive = isPlateAssignedAndActive(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    // Prefer custom (non-default-seed) merchant assignment if plate is not #002
    const isPlate2 = isSamePlateCode(cleanTarget, 'QRC0002');
    if (!isPlate2) {
      const aSlug =
        extractSlugFromUrl(a.redirect_url || a.redirectUrl) ||
        a.merchant_slug ||
        a.tenants?.slug ||
        (Array.isArray(a.tenants) ? a.tenants[0]?.slug : '') ||
        '';
      const bSlug =
        extractSlugFromUrl(b.redirect_url || b.redirectUrl) ||
        b.merchant_slug ||
        b.tenants?.slug ||
        (Array.isArray(b.tenants) ? b.tenants[0]?.slug : '') ||
        '';
      const aMerchant = a.merchant_id || a.tenant_id || '';
      const bMerchant = b.merchant_id || b.tenant_id || '';
      const aCustom = (aSlug && aSlug !== 'mrnavalha') || (aMerchant && aMerchant !== 'biz_mrnavalha') ? 1 : 0;
      const bCustom = (bSlug && bSlug !== 'mrnavalha') || (bMerchant && bMerchant !== 'biz_mrnavalha') ? 1 : 0;
      if (aCustom !== bCustom) return bCustom - aCustom;
    }

    // Prefer exact code match (e.g. 'QRC0004' === 'QRC0004' over '004')
    const aExact =
      String(a.id || '').trim().toUpperCase() === cleanTarget ||
      String(a.qr_code_id || '').trim().toUpperCase() === cleanTarget
        ? 1
        : 0;
    const bExact =
      String(b.id || '').trim().toUpperCase() === cleanTarget ||
      String(b.qr_code_id || '').trim().toUpperCase() === cleanTarget
        ? 1
        : 0;
    if (aExact !== bExact) return bExact - aExact;

    // Prefer newer updated_at timestamp
    const aTime = new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0).getTime() || 0;
    return bTime - aTime;
  })[0];
}



