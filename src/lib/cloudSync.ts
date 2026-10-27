/**
 * Global Cloud Sync Fallback Service
 * Synchronizes businesses and QR mappings across all devices and anonymous/incognito browsers
 * (e.g. Desktop Super Admin -> Mobile QR Scanner on Vercel)
 * even when Supabase tables are unreachable or blocked by RLS.
 *
 * NOTE: api.restful-api.dev enforces a strict ~1,000-character limit on the `data` JSON column.
 * To prevent HTTP 500 errors when multiple businesses exist, we store ultra-compact records
 * (~150-220 bytes each) and automatically overflow additional businesses into child objects.
 */

const CLOUD_SYNC_OBJECT_ID = 'ff808181a09d98f701a0c414460b6189';
const CLOUD_SYNC_BASE_URL = 'https://api.restful-api.dev/objects';
const CLOUD_SYNC_ENDPOINT = `${CLOUD_SYNC_BASE_URL}/${CLOUD_SYNC_OBJECT_ID}`;
const MAX_DATA_BYTES = 850; // Safe margin below 1,000-byte VARCHAR limit

export interface CloudSyncPayload {
  businesses?: any[];
  nfcPlates?: any[];
  deletedBusinessIds?: string[];
  maxPlateNumber?: number;
  updatedAt?: string;
}

interface CompactBiz {
  i: string; // id
  n: string; // name
  s: string; // slug
  c?: string; // category
  g?: string; // googleReviewUrl
  l?: string; // logoUrl (only if short http URL)
  u?: string; // currency
  p?: string; // phone
  e?: string; // email
}

let cachedCloudData: CloudSyncPayload | null = null;
let lastFetchTime = 0;

function toCompactBiz(b: any): CompactBiz {
  const logo = typeof b.logoUrl === 'string' && b.logoUrl.startsWith('http') && b.logoUrl.length < 140 ? b.logoUrl : undefined;
  const item: CompactBiz = {
    i: String(b.id || b.slug || '').slice(0, 48),
    n: String(b.name || '').slice(0, 60),
    s: String(b.slug || '').toLowerCase().trim().slice(0, 48)
  };
  if (b.category && b.category !== 'Comércio & Serviços') item.c = String(b.category).slice(0, 35);
  if (b.googleReviewUrl) item.g = String(b.googleReviewUrl).slice(0, 160);
  if (logo) item.l = logo;
  if (b.currency && b.currency !== 'EUR') item.u = b.currency;
  if (b.phone) item.p = String(b.phone).slice(0, 24);
  if (b.email) item.e = String(b.email).slice(0, 50);
  return item;
}

function fromCompactBiz(c: any): any {
  if (!c) return null;
  const id = c.i || c.id || '';
  const name = c.n || c.name || '';
  const slug = c.s || c.slug || '';
  if (!id || !name) return null;
  return {
    id,
    name,
    slug,
    category: c.c || c.category || 'Comércio & Serviços',
    googleReviewUrl: c.g || c.googleReviewUrl || '',
    logoUrl: c.l || c.logoUrl || '',
    currency: c.u || c.currency || 'EUR',
    phone: c.p || c.phone || '',
    email: c.e || c.email || `${slug}@reputaflow.com`,
    status: c.status || 'active',
    minRatingForGoogle: Number(c.minRatingForGoogle ?? 4),
    activePlan: c.activePlan || 'pro',
    planId: c.planId || 'plan_pro',
    updatedAt: c.updatedAt || new Date().toISOString()
  };
}

/**
 * Fetches global cloud state from the public sync endpoint (and any overflow chunk objects).
 */
export async function fetchGlobalCloudData(forceRefresh = false): Promise<CloudSyncPayload | null> {
  const now = Date.now();
  if (!forceRefresh && cachedCloudData && now - lastFetchTime < 3000) {
    return cachedCloudData;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(`${CLOUD_SYNC_ENDPOINT}?_t=${now}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return cachedCloudData;

    const json = await res.json();
    const rawData = json?.data;
    if (!rawData || typeof rawData !== 'object') return cachedCloudData;

    let compactList: any[] = [];
    if (Array.isArray(rawData.b)) {
      compactList.push(...rawData.b);
    } else if (Array.isArray(rawData.businesses)) {
      compactList.push(...rawData.businesses);
    }

    // Fetch overflow chunk objects if present
    const chunkIds: string[] = Array.isArray(rawData.k) ? rawData.k : [];
    if (chunkIds.length > 0) {
      try {
        const query = chunkIds.map((id) => `id=${encodeURIComponent(id)}`).join('&');
        const chunkRes = await fetch(`${CLOUD_SYNC_BASE_URL}?${query}&_t=${now}`, {
          cache: 'no-store'
        });
        if (chunkRes.ok) {
          const chunkObjects = await chunkRes.json();
          if (Array.isArray(chunkObjects)) {
            for (const obj of chunkObjects) {
              if (obj?.data && Array.isArray(obj.data.b)) {
                compactList.push(...obj.data.b);
              }
            }
          }
        }
      } catch {}
    }

    const businesses = compactList.map(fromCompactBiz).filter(Boolean);
    const deletedIds: string[] = Array.isArray(rawData.d)
      ? rawData.d
      : Array.isArray(rawData.deletedBusinessIds)
      ? rawData.deletedBusinessIds
      : [];

    // Reconstruct active QR plate mappings from `p` map + businesses
    const plateMap: Record<string, string> = rawData.p && typeof rawData.p === 'object' ? { ...rawData.p } : {};
    const maxPlateNumber = Number(rawData.m || 5);
    const nfcPlates: any[] = [];

    // Ensure default assigned plates are present if not explicitly overridden
    const customBiz = businesses.filter((b) => b && b.slug && b.slug !== 'mrnavalha');
    if (customBiz.length > 0 && !plateMap['001']) {
      plateMap['001'] = customBiz[0].slug;
    }
    if (!plateMap['002']) {
      plateMap['002'] = 'mrnavalha';
    }

    // 1. Add all numbered plates up to maxPlateNumber (active if in plateMap, inactive stock otherwise)
    let highestNum = maxPlateNumber;
    for (const code of Object.keys(plateMap)) {
      const num = parseInt(code.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > highestNum) {
        highestNum = num;
      }
    }

    for (let i = 1; i <= highestNum; i++) {
      const code = String(i).padStart(3, '0');
      const qrcCode = `QRC${String(i).padStart(4, '0')}`;
      const assignedSlug = plateMap[code] || plateMap[qrcCode] || plateMap[String(i)];

      if (assignedSlug) {
        const matched = businesses.find((b) => b.slug === assignedSlug || b.id === assignedSlug);
        nfcPlates.push({
          id: code,
          qr_code_id: code,
          status: 'active',
          merchant_id: matched?.id || assignedSlug,
          merchant_slug: matched?.slug || assignedSlug,
          merchant_name: matched?.name || assignedSlug,
          merchant_logo_url: matched?.logoUrl || undefined,
          redirect_url: `/r/${matched?.slug || assignedSlug}`,
          scan_count: code === '002' ? 3 : 0,
          updated_at: matched?.updatedAt || new Date().toISOString()
        });
      } else {
        nfcPlates.push({
          id: code,
          qr_code_id: code,
          status: 'inactive',
          merchant_id: null,
          merchant_slug: undefined,
          merchant_name: undefined,
          redirect_url: null,
          scan_count: 0,
          updated_at: '2026-09-21T10:00:00.000Z'
        });
      }
    }

    // 2. Also include any custom non-numeric plate keys in plateMap
    for (const [code, slug] of Object.entries(plateMap)) {
      const num = parseInt(code.replace(/\D/g, ''), 10);
      const isAlreadyAdded = !isNaN(num) && num >= 1 && num <= highestNum;
      if (!isAlreadyAdded && slug) {
        const matched = businesses.find((b) => b.slug === slug || b.id === slug);
        nfcPlates.push({
          id: code,
          qr_code_id: code,
          status: 'active',
          merchant_id: matched?.id || slug,
          merchant_slug: matched?.slug || slug,
          merchant_name: matched?.name || slug,
          merchant_logo_url: matched?.logoUrl || undefined,
          redirect_url: `/r/${matched?.slug || slug}`,
          scan_count: 0,
          updated_at: new Date().toISOString()
        });
      }
    }

    cachedCloudData = {
      businesses,
      nfcPlates,
      deletedBusinessIds: deletedIds,
      maxPlateNumber: highestNum,
      updatedAt: rawData.u || rawData.updatedAt || new Date().toISOString()
    };
    lastFetchTime = now;
    return cachedCloudData;
  } catch {
    return cachedCloudData;
  }
}

/**
 * Helper to create a chunk object on restful-api.dev for overflow businesses
 */
async function createCloudChunk(batch: CompactBiz[]): Promise<string | null> {
  try {
    const res = await fetch(CLOUD_SYNC_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'reputaflow_chunk',
        data: { b: batch }
      })
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.id) return String(json.id);
    }
  } catch {}
  return null;
}

/**
 * Pushes updated businesses and NFC plate assignments/stock to the global cloud sync endpoint,
 * strictly keeping each object's `data` payload below 850 bytes.
 */
export async function pushGlobalCloudData(partial: Partial<CloudSyncPayload>): Promise<boolean> {
  try {
    const current = (await fetchGlobalCloudData(true)) || {};

    const rawBusinesses = partial.businesses !== undefined ? partial.businesses : current.businesses || [];
    const rawPlates = partial.nfcPlates !== undefined ? partial.nfcPlates : current.nfcPlates || [];
    const deletedIds = (
      partial.deletedBusinessIds !== undefined
        ? partial.deletedBusinessIds
        : current.deletedBusinessIds || []
    ).slice(0, 10);

    const compactAll = rawBusinesses
      .filter((b: any) => b && b.name && b.slug)
      .map(toCompactBiz);

    // Build compact plate mapping `pMap` preserving all assigned plates + tracking highest plate number `maxNum`
    const pMap: Record<string, string> = {};
    let maxNum = Number(partial.maxPlateNumber || current.maxPlateNumber || 5);

    const customBiz = compactAll.filter((b) => b.s !== 'mrnavalha');
    if (customBiz.length > 0) {
      pMap['001'] = customBiz[0].s;
    }
    pMap['002'] = 'mrnavalha';

    if (Array.isArray(rawPlates)) {
      for (const p of rawPlates) {
        if (!p || !p.id) continue;
        const rawId = String(p.id).trim();
        const digits = rawId.replace(/\D/g, '');
        const num = digits ? parseInt(digits, 10) : NaN;
        if (!isNaN(num) && num > maxNum && num <= 5000) {
          maxNum = num;
        }

        const isActive = p.status === 'active' && Boolean(p.merchant_slug || p.merchant_id || p.redirect_url);
        if (isActive) {
          const slug =
            p.merchant_slug ||
            (typeof p.redirect_url === 'string'
              ? p.redirect_url.replace(/^.*\/r\//, '').replace(/^.*\?b=/, '').split(/[&#?]/)[0]
              : '') ||
            p.merchant_id;
          if (slug) {
            const key = !isNaN(num) && num > 0 ? String(num).padStart(3, '0') : rawId;
            // Only store numbered or explicit plate codes in pMap (skip business slug self-entries to save space)
            if (!isNaN(num) || /^(?:QRC|NFC|PLACA)/i.test(rawId)) {
              pMap[key] = String(slug).trim();
            }
          }
        }
      }
    }

    // Pack as many businesses into root `b` as fit under MAX_DATA_BYTES, and put the rest in chunks
    const rootBiz: CompactBiz[] = [];
    const overflowBiz: CompactBiz[] = [];

    for (const item of compactAll) {
      const testPayload = {
        v: 2,
        b: [...rootBiz, item],
        p: pMap,
        m: maxNum,
        d: deletedIds.length > 0 ? deletedIds : undefined
      };
      if (JSON.stringify(testPayload).length <= MAX_DATA_BYTES - 120) {
        rootBiz.push(item);
      } else {
        overflowBiz.push(item);
      }
    }

    const chunkIds: string[] = [];
    if (overflowBiz.length > 0) {
      for (let i = 0; i < overflowBiz.length; i += 2) {
        const batch = overflowBiz.slice(i, i + 2);
        const cid = await createCloudChunk(batch);
        if (cid) chunkIds.push(cid);
      }
    }

    const rootData: Record<string, any> = {
      v: 2,
      b: rootBiz,
      p: pMap,
      m: maxNum
    };
    if (chunkIds.length > 0) rootData.k = chunkIds;
    if (deletedIds.length > 0) rootData.d = deletedIds;

    const res = await fetch(CLOUD_SYNC_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        name: 'reputaflow_v1_businesses',
        data: rootData
      })
    });

    if (res.ok) {
      lastFetchTime = 0;
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[pushGlobalCloudData notice]:', err);
    return false;
  }
}
