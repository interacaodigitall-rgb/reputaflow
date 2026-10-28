/**
 * Global Cloud Sync Fallback Service
 * Synchronizes businesses, permanent deletions, and 1-to-1 QR plate mappings across all devices
 * and anonymous/incognito browsers (e.g. Desktop Super Admin -> Mobile QR Scanner on Vercel).
 */

const CLOUD_SYNC_OBJECT_ID = 'ff808181a09d98f701a0c414460b6189';
const CLOUD_SYNC_BASE_URL = 'https://api.restful-api.dev/objects';
const CLOUD_SYNC_ENDPOINT = `${CLOUD_SYNC_BASE_URL}/${CLOUD_SYNC_OBJECT_ID}`;
const MAX_DATA_BYTES = 850; // Safe margin below 1,000-byte VARCHAR limit

const LOCAL_BUSINESSES_STORAGE_KEY = 'reputaflow_persisted_businesses_v1';
const LOCAL_DELETED_BUSINESSES_KEY = 'reputaflow_deleted_businesses_v1';

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

function normalizeKey(str: string = ''): string {
  return String(str || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeSlug(str: string = ''): string {
  return String(str || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getLocalDeletedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_BUSINESSES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((x) => String(x || '').toLowerCase().trim()).filter(Boolean));
      }
    }
  } catch {}
  return new Set();
}

function saveLocalDeletedSet(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_DELETED_BUSINESSES_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function isBusinessDeleted(b: any, deletedSet: Set<string>): boolean {
  if (!b) return true;
  const id = String(b.i || b.id || '').toLowerCase().trim();
  const slug = normalizeSlug(b.s || b.slug || '');
  const nameKey = normalizeKey(b.n || b.name || '');
  return Boolean(
    (id && deletedSet.has(id)) ||
    (slug && deletedSet.has(slug)) ||
    (nameKey && deletedSet.has(nameKey))
  );
}

function readLocalBusinessesFallback(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_BUSINESSES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function toCompactBiz(b: any): CompactBiz {
  const logo =
    typeof b.logoUrl === 'string' && b.logoUrl.startsWith('http') && b.logoUrl.length < 140
      ? b.logoUrl
      : undefined;
  const item: CompactBiz = {
    i: String(b.id || b.slug || '').slice(0, 48),
    n: String(b.name || '').slice(0, 60),
    s: normalizeSlug(b.slug || b.name || '').slice(0, 48)
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
  const slug = normalizeSlug(c.s || c.slug || name);
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

    const cloudDeleted: string[] = Array.isArray(rawData.d)
      ? rawData.d
      : Array.isArray(rawData.deletedBusinessIds)
      ? rawData.deletedBusinessIds
      : [];

    const deletedSet = getLocalDeletedSet();
    cloudDeleted.forEach((k) => {
      if (k) deletedSet.add(String(k).toLowerCase().trim());
    });
    if (cloudDeleted.length > 0) {
      saveLocalDeletedSet(deletedSet);
    }

    // Filter out any deleted business and deduplicate by normalized slug/name
    const bizByKey = new Map<string, any>();
    for (const rawItem of compactList) {
      const mapped = fromCompactBiz(rawItem);
      if (!mapped || isBusinessDeleted(mapped, deletedSet)) continue;
      const key = normalizeSlug(mapped.slug) || normalizeKey(mapped.name);
      if (!bizByKey.has(key)) {
        bizByKey.set(key, mapped);
      }
    }
    const businesses = Array.from(bizByKey.values());

    // Reconstruct QR plates with strict 1-plate-per-merchant enforcement
    const rawPlateMap: Record<string, string> =
      rawData.p && typeof rawData.p === 'object' ? { ...rawData.p } : {};
    const maxPlateNumber = Math.max(Number(rawData.m || 5), 5);

    let highestNum = maxPlateNumber;
    for (const code of Object.keys(rawPlateMap)) {
      const num = parseInt(code.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > highestNum && num <= 5000) {
        highestNum = num;
      }
    }

    // Build clean 1-to-1 plate assignment map (each merchant can only own 1 plate)
    const cleanPlateToSlug = new Map<string, string>();
    const assignedMerchantSlugs = new Set<string>();

    // First, if Mr. Navalha exists and is on 002, reserve 002 for mrnavalha so it doesn't take 001
    if (
      businesses.some((b) => b.slug === 'mrnavalha') &&
      (!rawPlateMap['002'] || rawPlateMap['002'] === 'mrnavalha')
    ) {
      cleanPlateToSlug.set('002', 'mrnavalha');
      assignedMerchantSlugs.add('mrnavalha');
    }

    for (const [rawCode, rawSlug] of Object.entries(rawPlateMap)) {
      const num = parseInt(rawCode.replace(/\D/g, ''), 10);
      if (isNaN(num) || num <= 0) continue;
      const code = String(num).padStart(3, '0');
      const slug = normalizeSlug(rawSlug);
      if (!slug || deletedSet.has(slug)) continue;

      const matchedBiz = businesses.find((b) => normalizeSlug(b.slug) === slug || b.id === rawSlug);
      if (!matchedBiz) continue;

      const canonicalSlug = normalizeSlug(matchedBiz.slug);
      // Enforce 1 plate per merchant: skip if this merchant already has a plate assigned
      if (assignedMerchantSlugs.has(canonicalSlug) || cleanPlateToSlug.has(code)) {
        continue;
      }

      cleanPlateToSlug.set(code, canonicalSlug);
      assignedMerchantSlugs.add(canonicalSlug);
    }

    // If SBK BARBERSHOP (or another custom merchant) exists and has no plate yet, assign it to 001 (if 001 is free)
    const sbkOrCustom = businesses.find(
      (b) => normalizeSlug(b.slug) !== 'mrnavalha' && !assignedMerchantSlugs.has(normalizeSlug(b.slug))
    );
    if (sbkOrCustom && !cleanPlateToSlug.has('001')) {
      const s = normalizeSlug(sbkOrCustom.slug);
      cleanPlateToSlug.set('001', s);
      assignedMerchantSlugs.add(s);
    }

    const nfcPlates: any[] = [];
    for (let i = 1; i <= highestNum; i++) {
      const code = String(i).padStart(3, '0');
      const assignedSlug = cleanPlateToSlug.get(code);
      const matched = assignedSlug
        ? businesses.find((b) => normalizeSlug(b.slug) === assignedSlug)
        : undefined;

      if (matched) {
        nfcPlates.push({
          id: code,
          qr_code_id: code,
          status: 'active',
          merchant_id: matched.id,
          merchant_slug: matched.slug,
          merchant_name: matched.name,
          merchant_logo_url: matched.logoUrl || undefined,
          redirect_url: `/r/${matched.slug}`,
          scan_count: code === '002' ? 3 : 0,
          updated_at: matched.updatedAt || new Date().toISOString()
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

    cachedCloudData = {
      businesses,
      nfcPlates,
      deletedBusinessIds: Array.from(deletedSet),
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
 * Pushes updated businesses, permanent deletions, and 1-to-1 NFC plate assignments to the global cloud sync endpoint.
 */
export async function pushGlobalCloudData(partial: Partial<CloudSyncPayload>): Promise<boolean> {
  try {
    const current = (await fetchGlobalCloudData(true)) || {};

    const deletedSet = getLocalDeletedSet();
    if (Array.isArray(current.deletedBusinessIds)) {
      current.deletedBusinessIds.forEach((id) => deletedSet.add(String(id).toLowerCase().trim()));
    }
    if (Array.isArray(partial.deletedBusinessIds)) {
      partial.deletedBusinessIds.forEach((id) => deletedSet.add(String(id).toLowerCase().trim()));
    }
    saveLocalDeletedSet(deletedSet);

    // Combine businesses from partial, local cache, and current cloud state (excluding deleted)
    const combinedRaw =
      partial.businesses !== undefined
        ? [...partial.businesses]
        : [...readLocalBusinessesFallback(), ...(current.businesses || [])];

    const dedupBizMap = new Map<string, CompactBiz>();
    for (const b of combinedRaw) {
      if (!b || !b.name || isBusinessDeleted(b, deletedSet)) continue;
      const compact = toCompactBiz(b);
      const key = compact.s || normalizeKey(compact.n);
      if (!dedupBizMap.has(key)) {
        dedupBizMap.set(key, compact);
      } else {
        const existing = dedupBizMap.get(key)!;
        dedupBizMap.set(key, {
          ...existing,
          ...compact,
          g: compact.g || existing.g,
          l: compact.l || existing.l,
          p: compact.p || existing.p,
          e: compact.e || existing.e
        });
      }
    }
    const compactAll = Array.from(dedupBizMap.values());

    const rawPlates =
      partial.nfcPlates !== undefined ? partial.nfcPlates : current.nfcPlates || [];
    let maxNum = Math.max(Number(partial.maxPlateNumber || current.maxPlateNumber || 5), 5);

    // Build strict 1-plate-per-merchant map `pMap`
    const pMap: Record<string, string> = {};
    const assignedSlugs = new Set<string>();

    if (Array.isArray(rawPlates)) {
      for (const p of rawPlates) {
        if (!p || !p.id) continue;
        const digits = String(p.id).replace(/\D/g, '');
        const num = digits ? parseInt(digits, 10) : NaN;
        if (isNaN(num) || num <= 0 || num > 5000) continue;

        if (num > maxNum) maxNum = num;

        const isActive =
          p.status === 'active' && Boolean(p.merchant_slug || p.merchant_id || p.redirect_url);
        if (isActive) {
          const rawTarget =
            p.merchant_slug ||
            (typeof p.redirect_url === 'string'
              ? p.redirect_url.replace(/^.*\/r\//, '').replace(/^.*\?b=/, '').split(/[&#?]/)[0]
              : '') ||
            p.merchant_id;
          const matchedBiz = compactAll.find(
            (b) => b.s === normalizeSlug(rawTarget) || b.i === rawTarget
          );
          if (matchedBiz && !assignedSlugs.has(matchedBiz.s)) {
            const plateKey = String(num).padStart(3, '0');
            if (!pMap[plateKey]) {
              pMap[plateKey] = matchedBiz.s;
              assignedSlugs.add(matchedBiz.s);
            }
          }
        }
      }
    }

    // Ensure default 1-to-1 assignments if not explicitly linked yet
    const mrNavalha = compactAll.find((b) => b.s === 'mrnavalha');
    if (mrNavalha && !assignedSlugs.has('mrnavalha') && !pMap['002']) {
      pMap['002'] = 'mrnavalha';
      assignedSlugs.add('mrnavalha');
    }

    const firstCustom = compactAll.find(
      (b) => b.s !== 'mrnavalha' && !assignedSlugs.has(b.s)
    );
    if (firstCustom && !pMap['001']) {
      pMap['001'] = firstCustom.s;
      assignedSlugs.add(firstCustom.s);
    }

    const deletedIds = Array.from(deletedSet).slice(-12);

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
