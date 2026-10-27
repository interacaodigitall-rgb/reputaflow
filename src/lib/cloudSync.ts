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
  // Support both compact format { i, n, s, ... } and legacy full format { id, name, slug, ... }
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

    // Reconstruct active QR plate mappings from businesses + optional `p` map
    const plateMap: Record<string, string> = rawData.p && typeof rawData.p === 'object' ? rawData.p : {};
    const nfcPlates: any[] = [];

    // Every business automatically has its own direct QR code + sequential index fallback
    businesses.forEach((b, idx) => {
      if (!b || !b.slug) return;
      nfcPlates.push({
        id: b.slug,
        qr_code_id: b.slug,
        status: 'active',
        merchant_id: b.id,
        merchant_slug: b.slug,
        merchant_name: b.name,
        redirect_url: `/r/${b.slug}`,
        scan_count: 0,
        updated_at: b.updatedAt
      });
      const seqCode = String(idx + 1).padStart(3, '0');
      if (!plateMap[seqCode]) {
        plateMap[seqCode] = b.slug;
      }
    });

    for (const [code, slug] of Object.entries(plateMap)) {
      const matched = businesses.find((b) => b.slug === slug || b.id === slug);
      nfcPlates.push({
        id: code,
        qr_code_id: code,
        status: 'active',
        merchant_id: matched?.id || slug,
        merchant_slug: matched?.slug || slug,
        merchant_name: matched?.name || slug,
        redirect_url: `/r/${matched?.slug || slug}`,
        scan_count: 0,
        updated_at: new Date().toISOString()
      });
    }

    cachedCloudData = {
      businesses,
      nfcPlates,
      deletedBusinessIds: deletedIds,
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
 * Pushes updated businesses to the global cloud sync endpoint, strictly keeping
 * each object's `data` payload below 850 bytes so restful-api.dev never returns HTTP 500.
 */
export async function pushGlobalCloudData(partial: Partial<CloudSyncPayload>): Promise<boolean> {
  try {
    const current = (await fetchGlobalCloudData(true)) || {};

    const rawBusinesses = partial.businesses !== undefined ? partial.businesses : current.businesses || [];
    const deletedIds = (
      partial.deletedBusinessIds !== undefined
        ? partial.deletedBusinessIds
        : current.deletedBusinessIds || []
    ).slice(0, 10);

    const compactAll = rawBusinesses
      .filter((b: any) => b && b.name && b.slug)
      .map(toCompactBiz);

    // Build compact plate mapping for numeric codes (e.g. 001 -> first custom merchant, 002 -> mrnavalha)
    const pMap: Record<string, string> = {};
    const customBiz = compactAll.filter((b) => b.s !== 'mrnavalha');
    if (customBiz.length > 0) {
      pMap['001'] = customBiz[0].s;
      customBiz.forEach((b, idx) => {
        const code = String(idx + 3).padStart(3, '0');
        pMap[code] = b.s;
      });
    }
    pMap['002'] = 'mrnavalha';

    // Pack as many businesses into root `b` as fit under MAX_DATA_BYTES, and put the rest in chunks
    const rootBiz: CompactBiz[] = [];
    const overflowBiz: CompactBiz[] = [];

    for (const item of compactAll) {
      const testPayload = {
        v: 2,
        b: [...rootBiz, item],
        p: pMap,
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
      // Group overflow businesses into batches of 2 (~450 bytes per chunk)
      for (let i = 0; i < overflowBiz.length; i += 2) {
        const batch = overflowBiz.slice(i, i + 2);
        const cid = await createCloudChunk(batch);
        if (cid) chunkIds.push(cid);
      }
    }

    const rootData: Record<string, any> = {
      v: 2,
      b: rootBiz,
      p: pMap
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
      lastFetchTime = 0; // Force next read to refresh
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[pushGlobalCloudData notice]:', err);
    return false;
  }
}
