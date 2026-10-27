import { supabase } from './supabase';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';
import { Business } from '../types';
import { extractSlugFromUrl, isSamePlateCode, findBestMatchingPlate } from './urlHelper';
import { fetchGlobalCloudData, pushGlobalCloudData } from './cloudSync';
import { getLocalBusinesses } from './dbService';
export type { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';

const NFC_STORAGE_KEY = 'reputaflow_nfc_plates_cache';

export const INITIAL_NFC_PLATES: NfcPlate[] = [
  { id: '001', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  {
    id: '002',
    status: 'active',
    merchant_id: 'biz_mrnavalha',
    redirect_url: '/?b=mrnavalha',
    scan_count: 3,
    merchant_name: 'Mr. Navalha',
    merchant_slug: 'mrnavalha',
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T12:00:00.000Z'
  },
  { id: '003', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '004', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '005', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '006', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '007', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '008', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '009', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' },
  { id: '010', status: 'inactive', merchant_id: null, redirect_url: null, scan_count: 0, created_at: '2026-09-21T10:00:00.000Z', updated_at: '2026-09-21T10:00:00.000Z' }
];

/**
 * Cleans up legacy hardcoded seed assignments where 001, 003, 004, 005 were pre-populated with Mr. Navalha.
 * Also repairs any plate where merchant_id points to a custom merchant but redirect_url still has mrnavalha.
 */
function sanitizePlatesList(plates: NfcPlate[], businesses: Business[] = []): NfcPlate[] {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  return plates.map((p) => {
    if (!p || !p.id) return p;
    const isPlate2 = isSamePlateCode(p.id, 'QRC0002');
    const isLegacySeedTimestamp =
      p.updated_at === '2026-09-21T12:00:00.000Z' ||
      (p.created_at === '2026-09-21T10:00:00.000Z' && String(p.updated_at || '').startsWith('2026-09-21'));

    // If not plate #002 and it still has the old pre-seeded Mr. Navalha assignment, reset to inactive
    if (!isPlate2 && p.merchant_id === 'biz_mrnavalha' && isLegacySeedTimestamp) {
      return {
        ...p,
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        merchant_name: undefined,
        merchant_slug: undefined,
        updated_at: '2026-09-21T10:00:00.000Z'
      };
    }

    return mapNfcRow(p, allBiz);
  });
}

function getLocalNfcCache(): NfcPlate[] {
  if (typeof window === 'undefined') return [...INITIAL_NFC_PLATES];
  try {
    const raw = localStorage.getItem(NFC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizePlatesList(parsed);
      }
    }
  } catch {}
  return [...INITIAL_NFC_PLATES];
}

function saveLocalNfcCache(plates: NfcPlate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NFC_STORAGE_KEY, JSON.stringify(plates));
  } catch {}
}

/**
 * Synchronous fast-lookup for a plate by ID or QR code from local cache or pre-configured batch.
 * Strictly prioritizes active custom plates and exact code matches over seed plates.
 */
export function findFastNfcPlate(idOrCode: string): NfcPlate | null {
  if (!idOrCode) return null;
  const clean = idOrCode.trim();

  // 1. Check sanitized local storage cache first
  const localList = getLocalNfcCache();
  const fromLocal = findBestMatchingPlate(localList, clean);
  if (fromLocal && fromLocal.status === 'active') {
    return fromLocal;
  }

  // 2. Check INITIAL_NFC_PLATES fallback
  const fromInit = findBestMatchingPlate(INITIAL_NFC_PLATES, clean);
  return fromLocal || fromInit || null;
}

export function mapNfcRow(row: any, businesses: Business[] = []): NfcPlate {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  const rawId = String(row.id || row.qr_code_id || '').trim();
  const mId = row.merchant_id || row.merchantId || row.tenant_id || row.business_id || null;
  const redir = row.redirect_url || row.redirectUrl || null;
  const slugFromUrl = extractSlugFromUrl(redir);

  // Strict lookup: check merchant_id match and redirect_url slug match separately so businesses[0] (Mr. Navalha) never wins by accident
  const bizById = mId
    ? allBiz.find((b) => b.id === mId || b.slug.toLowerCase() === String(mId).toLowerCase())
    : undefined;
  const bizBySlug = slugFromUrl
    ? allBiz.find((b) => b.slug.toLowerCase() === slugFromUrl.toLowerCase() || b.id === slugFromUrl)
    : undefined;

  let matchedBiz = bizById || bizBySlug;
  if (bizById && bizById.id !== 'biz_mrnavalha') {
    matchedBiz = bizById;
  } else if (bizBySlug && bizBySlug.id !== 'biz_mrnavalha') {
    matchedBiz = bizBySlug;
  }

  const resolvedSlug =
    (bizById && bizById.id !== 'biz_mrnavalha' ? bizById.slug : null) ||
    (slugFromUrl && slugFromUrl !== 'mrnavalha' ? slugFromUrl : null) ||
    matchedBiz?.slug ||
    slugFromUrl ||
    row.merchant_slug ||
    row.merchantSlug ||
    undefined;

  const isStatusActive = String(row.status || '').toLowerCase() === 'active';
  const finalRedirect = resolvedSlug ? `/?b=${encodeURIComponent(resolvedSlug)}` : redir;

  return {
    id: rawId,
    status: isStatusActive ? 'active' : 'inactive',
    merchant_id: matchedBiz?.id || mId,
    redirect_url: isStatusActive ? finalRedirect : null,
    scan_count: Number(row.scan_count ?? row.scanCount ?? 0),
    created_at: row.created_at || row.createdAt || new Date().toISOString(),
    updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
    merchant_name: isStatusActive ? matchedBiz?.name || row.merchant_name : undefined,
    merchant_slug: isStatusActive ? resolvedSlug : undefined,
    merchant_logo_url: isStatusActive ? matchedBiz?.logoUrl || row.merchant_logo_url : undefined
  };
}

/**
 * Merges multiple plate lists, ensuring active/updated plates update any normalized equivalents (e.g. QRC0004 <-> 004).
 */
function mergePlatesLists(businesses: Business[], ...lists: NfcPlate[][]): NfcPlate[] {
  const byId = new Map<string, NfcPlate>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const rawItem of list) {
      if (!rawItem || !rawItem.id) continue;
      const item = mapNfcRow(rawItem, businesses);
      const key = item.id.toUpperCase();
      const existing = byId.get(key);

      if (!existing) {
        byId.set(key, item);
      } else {
        const existingActive = existing.status === 'active' && Boolean(existing.merchant_slug || existing.redirect_url);
        const itemActive = item.status === 'active' && Boolean(item.merchant_slug || item.redirect_url);
        const existingTime = new Date(existing.updated_at || 0).getTime() || 0;
        const itemTime = new Date(item.updated_at || 0).getTime() || 0;

        if ((itemActive && !existingActive) || (itemActive === existingActive && itemTime >= existingTime)) {
          byId.set(key, {
            ...existing,
            ...item,
            scan_count: Math.max(existing.scan_count || 0, item.scan_count || 0)
          });
        }
      }
    }
  }

  // Synchronize normalized duplicates (e.g. if QRC0004 is active and 004 is inactive seed, sync 004 or keep consistent)
  const allPlates = Array.from(byId.values());
  for (const p of allPlates) {
    if (p.status === 'active' && (p.merchant_slug || p.redirect_url)) {
      for (const other of allPlates) {
        if (other.id !== p.id && isSamePlateCode(other.id, p.id)) {
          const otherTime = new Date(other.updated_at || 0).getTime() || 0;
          const pTime = new Date(p.updated_at || 0).getTime() || 0;
          if (other.status !== 'active' || pTime > otherTime) {
            other.status = 'active';
            other.merchant_id = p.merchant_id;
            other.redirect_url = p.redirect_url;
            other.merchant_name = p.merchant_name;
            other.merchant_slug = p.merchant_slug;
            other.merchant_logo_url = p.merchant_logo_url;
            other.updated_at = p.updated_at;
          }
        }
      }
    }
  }

  return sanitizePlatesList(allPlates, businesses);
}

/**
 * Fetches all NFC plates from Local Cache, Cloud Sync, Server API & Supabase
 */
export async function getNfcPlates(businesses: Business[] = []): Promise<NfcPlate[]> {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  const localCache = getLocalNfcCache();
  let serverPlates: NfcPlate[] = [];
  let cloudPlates: NfcPlate[] = [];
  let supabasePlates: NfcPlate[] = [];

  // 1. Try Server REST API (verifying JSON content-type so static Vercel rewrite is ignored)
  const serverPromise = (async () => {
    try {
      const res = await fetch('/api/nfc', { cache: 'no-store' }).catch(() => null);
      const contentType = res?.headers?.get('content-type') || '';
      if (res && res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          serverPlates = data.map((r) => mapNfcRow(r, allBiz));
        }
      }
    } catch {}
  })();

  // 2. Try Global Cloud Sync (works on Vercel & mobile across all devices)
  const cloudPromise = (async () => {
    try {
      const cloudData = await fetchGlobalCloudData();
      if (cloudData && Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
        cloudPlates = sanitizePlatesList(cloudData.nfcPlates, allBiz);
      }
    } catch {}
  })();

  // 3. Try Supabase
  const supabasePromise = (async () => {
    try {
      const { data, error } = await supabase.from('nfc_plates').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        supabasePlates = data.map((r) => mapNfcRow(r, allBiz));
      }
    } catch {}
  })();

  await Promise.all([serverPromise, cloudPromise, supabasePromise]);

  const merged = mergePlatesLists(allBiz, INITIAL_NFC_PLATES, localCache, serverPlates, cloudPlates, supabasePlates);
  saveLocalNfcCache(merged);

  // Sync active plates to Cloud Sync if any active custom plates exist locally
  const hasActiveCustom = merged.some(
    (p) => p.status === 'active' && p.merchant_slug && !isSamePlateCode(p.id, 'QRC0002')
  );
  if (hasActiveCustom) {
    pushGlobalCloudData({ nfcPlates: merged }).catch(() => {});
  }

  return merged;
}

/**
 * Fetches a single NFC plate by its serial ID
 */
export async function getNfcPlateById(id: string): Promise<NfcPlate | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  const allPlates = await getNfcPlates();
  return findBestMatchingPlate(allPlates, cleanId);
}

/**
 * Generates a batch of NFC plates with sequential/padded IDs
 */
export async function createNfcPlatesBatch(
  options: CreateNfcBatchOptions
): Promise<{ success: boolean; createdCount: number; error?: string }> {
  const { quantity, prefix = '', startNumber = 1, padDigits = 3 } = options;

  if (quantity < 1) {
    return { success: false, createdCount: 0, error: 'A quantidade deve ser de pelo menos 1 placa.' };
  }

  const now = new Date().toISOString();
  const newPlates: NfcPlate[] = [];
  const rowsToInsert: any[] = [];

  for (let i = 0; i < quantity; i++) {
    const currentNum = startNumber + i;
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    const plateObj: NfcPlate = {
      id,
      status: 'inactive',
      merchant_id: null,
      redirect_url: null,
      scan_count: 0,
      created_at: now,
      updated_at: now
    };

    newPlates.push(plateObj);
    rowsToInsert.push({
      id,
      status: 'inactive',
      merchant_id: null,
      redirect_url: null,
      scan_count: 0,
      created_at: now,
      updated_at: now
    });
  }

  // 1. Immediately write to local cache
  const localCache = getLocalNfcCache();
  const map = new Map<string, NfcPlate>();
  localCache.forEach((p) => map.set(p.id, p));
  newPlates.forEach((p) => {
    if (!map.has(p.id)) map.set(p.id, p);
  });
  const updatedLocal = Array.from(map.values());
  saveLocalNfcCache(updatedLocal);

  // 2. Push to Cloud Sync (for Vercel & multi-device)
  pushGlobalCloudData({ nfcPlates: updatedLocal }).catch(() => {});

  // 3. Persist to Server REST API
  try {
    await fetch('/api/nfc/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
  } catch (e) {}

  // 4. Persist to Supabase
  try {
    await supabase.from('nfc_plates').upsert(rowsToInsert, {
      onConflict: 'id',
      ignoreDuplicates: true
    });
  } catch (err) {
    console.warn('[Supabase createNfcPlatesBatch catch]:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return {
    success: true,
    createdCount: newPlates.length
  };
}

/**
 * Links a plate to a merchant and activates it across LocalStorage, CloudSync, Server API, and Supabase
 */
export async function linkNfcPlate(
  id: string,
  merchantId: string,
  redirectUrl: string
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const allBiz = getLocalBusinesses();
  const selectedBiz = allBiz.find(
    (b) => b.id === merchantId || b.slug.toLowerCase() === String(merchantId).toLowerCase()
  );

  // Guarantee that if a valid business is selected, its slug is used for the redirect URL
  const slugFromBiz = selectedBiz?.slug;
  const slugFromInput = extractSlugFromUrl(redirectUrl);
  const resolvedSlug = slugFromBiz || slugFromInput || undefined;
  const cleanRedirect = resolvedSlug ? `/?b=${encodeURIComponent(resolvedSlug)}` : redirectUrl.trim();

  // 1. Update local cache (matching both exact ID and normalized numeric ID e.g. 004 <-> QRC0004)
  const localCache = getLocalNfcCache();
  let matchedExact = false;

  for (let i = 0; i < localCache.length; i++) {
    if (isSamePlateCode(localCache[i].id, id)) {
      if (localCache[i].id.toUpperCase() === id.trim().toUpperCase()) {
        matchedExact = true;
      }
      localCache[i] = {
        ...localCache[i],
        status: 'active',
        merchant_id: selectedBiz?.id || merchantId,
        redirect_url: cleanRedirect,
        merchant_slug: resolvedSlug,
        merchant_name: selectedBiz?.name,
        merchant_logo_url: selectedBiz?.logoUrl,
        updated_at: now
      };
    }
  }

  if (!matchedExact) {
    localCache.push({
      id: id.trim(),
      status: 'active',
      merchant_id: selectedBiz?.id || merchantId,
      redirect_url: cleanRedirect,
      merchant_slug: resolvedSlug,
      merchant_name: selectedBiz?.name,
      merchant_logo_url: selectedBiz?.logoUrl,
      scan_count: 0,
      created_at: now,
      updated_at: now
    });
  }
  saveLocalNfcCache(localCache);

  // 2. Immediately push to Global Cloud Sync (so mobile QR scans on Vercel immediately see the linked merchant!)
  try {
    await pushGlobalCloudData({
      businesses: allBiz,
      nfcPlates: localCache
    });
  } catch (e) {}

  // 3. Persist to Server API
  try {
    await fetch('/api/nfc/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id.trim(),
        merchantId: selectedBiz?.id || merchantId,
        redirectUrl: cleanRedirect
      })
    });
  } catch (e) {}

  // 4. Persist to Supabase (nfc_plates and qr_plates)
  try {
    await supabase
      .from('nfc_plates')
      .upsert(
        {
          id: id.trim(),
          status: 'active',
          merchant_id: selectedBiz?.id || merchantId || null,
          redirect_url: cleanRedirect,
          updated_at: now
        },
        { onConflict: 'id' }
      );
  } catch (err) {
    console.warn('[linkNfcPlate catch]:', err);
  }

  try {
    await supabase
      .from('qr_plates')
      .upsert(
        {
          qr_code_id: id.trim().toUpperCase(),
          tenant_id: selectedBiz?.id || merchantId || resolvedSlug || null,
          status: 'active',
          redirect_url: cleanRedirect
        },
        { onConflict: 'qr_code_id' }
      );
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return { success: true };
}

/**
 * Unlinks a plate and sets status to inactive
 */
export async function unlinkNfcPlate(id: string): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  // 1. Update local cache for both exact and normalized matches
  const localCache = getLocalNfcCache();
  for (let i = 0; i < localCache.length; i++) {
    if (isSamePlateCode(localCache[i].id, id)) {
      localCache[i] = {
        ...localCache[i],
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        merchant_name: undefined,
        merchant_slug: undefined,
        merchant_logo_url: undefined,
        updated_at: now
      };
    }
  }
  saveLocalNfcCache(localCache);

  // 2. Push to Cloud Sync
  pushGlobalCloudData({ nfcPlates: localCache }).catch(() => {});

  // 3. Persist to Server API
  try {
    await fetch('/api/nfc/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch (e) {}

  // 4. Persist to Supabase
  try {
    await supabase
      .from('nfc_plates')
      .update({
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        updated_at: now
      })
      .eq('id', id);
  } catch (err) {
    console.warn('[unlinkNfcPlate catch]:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return { success: true };
}

/**
 * Deletes an NFC plate
 */
export async function deleteNfcPlate(id: string): Promise<{ success: boolean; error?: string }> {
  // 1. Delete from local cache
  const localCache = getLocalNfcCache().filter((p) => p.id !== id);
  saveLocalNfcCache(localCache);

  // 2. Persist to Server API
  try {
    await fetch(`/api/nfc/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {}

  // 3. Delete from Supabase
  try {
    await supabase.from('nfc_plates').delete().eq('id', id);
  } catch (err) {
    console.warn('[deleteNfcPlate catch]:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return { success: true };
}

/**
 * Increments the scan count of an active NFC plate
 */
export async function incrementNfcScan(id: string, currentCount: number = 0): Promise<void> {
  const cleanId = id.trim();
  if (!cleanId) return;

  // 1. Update local cache
  const localCache = getLocalNfcCache();
  const idx = localCache.findIndex((p) => p.id === cleanId);
  if (idx >= 0) {
    localCache[idx].scan_count = (localCache[idx].scan_count || 0) + 1;
    saveLocalNfcCache(localCache);
  }

  // 2. Call Server API
  try {
    await fetch(`/api/nfc/scan/${encodeURIComponent(cleanId)}`, { method: 'POST' });
  } catch (e) {}

  // 3. Call Supabase
  try {
    await supabase.rpc('increment_nfc_scan', { plate_id: cleanId });
  } catch {}
}

function arePlatesEqual(a: NfcPlate[], b: NfcPlate[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].status !== b[i].status ||
      a[i].merchant_id !== b[i].merchant_id ||
      a[i].redirect_url !== b[i].redirect_url ||
      a[i].scan_count !== b[i].scan_count ||
      a[i].merchant_name !== b[i].merchant_name
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Realtime subscription for NFC plates with stability check
 */
export function subscribeNfcPlates(
  businesses: Business[],
  callback: (plates: NfcPlate[]) => void
): () => void {
  let isSubscribed = true;
  let lastEmittedPlates: NfcPlate[] = [];

  const fetchAndNotify = async () => {
    if (!isSubscribed) return;
    const plates = await getNfcPlates(businesses);
    if (!isSubscribed) return;

    if (!arePlatesEqual(plates, lastEmittedPlates)) {
      lastEmittedPlates = plates;
      callback(plates);
    }
  };

  const initialLocal = getLocalNfcCache();
  if (initialLocal.length > 0) {
    lastEmittedPlates = initialLocal;
    callback(initialLocal);
  }

  fetchAndNotify();

  const channelName = `rt_nfc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  let channel: any = null;

  try {
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nfc_plates' }, () => {
        fetchAndNotify();
      })
      .subscribe();
  } catch (err) {
    console.warn('[Supabase Realtime NFC Channel notice]:', err);
  }

  const interval = setInterval(fetchAndNotify, 10000);

  const handleCustomSync = () => {
    fetchAndNotify();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_nfc_sync', handleCustomSync);
  }

  return () => {
    isSubscribed = false;
    clearInterval(interval);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_nfc_sync', handleCustomSync);
    }
  };
}
