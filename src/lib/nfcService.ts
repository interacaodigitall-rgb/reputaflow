import { supabase } from './supabase';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';
import { Business } from '../types';

const NFC_STORAGE_KEY = 'reputaflow_nfc_plates_cache';

function getLocalNfcCache(): NfcPlate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NFC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalNfcCache(plates: NfcPlate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NFC_STORAGE_KEY, JSON.stringify(plates));
  } catch {}
}

function mapNfcRow(row: any, businesses: Business[] = []): NfcPlate {
  const mId = row.merchant_id || row.merchantId || null;
  const matchedBiz = mId ? businesses.find((b) => b.id === mId) : undefined;

  return {
    id: String(row.id || '').trim(),
    status: String(row.status || '').toLowerCase() === 'active' ? 'active' : 'inactive',
    merchant_id: mId,
    redirect_url: row.redirect_url || row.redirectUrl || null,
    scan_count: Number(row.scan_count ?? row.scanCount ?? 0),
    created_at: row.created_at || row.createdAt || new Date().toISOString(),
    updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
    merchant_name: matchedBiz?.name || row.merchant_name,
    merchant_slug: matchedBiz?.slug || row.merchant_slug,
    merchant_logo_url: matchedBiz?.logoUrl || row.merchant_logo_url
  };
}

/**
 * Fetches all NFC plates from Server API & Supabase
 */
export async function getNfcPlates(businesses: Business[] = []): Promise<NfcPlate[]> {
  const localCache = getLocalNfcCache();
  const plateMap = new Map<string, NfcPlate>();
  localCache.forEach((p) => plateMap.set(p.id, p));

  // 1. Try Server REST API first
  try {
    const res = await fetch('/api/nfc', { cache: 'no-store' });
    if (res.ok) {
      const serverPlates = await res.json();
      if (Array.isArray(serverPlates) && serverPlates.length > 0) {
        serverPlates.forEach((row) => {
          const mapped = mapNfcRow(row, businesses);
          plateMap.set(mapped.id, mapped);
        });
      }
    }
  } catch (e) {}

  // 2. Try Supabase
  try {
    const { data, error } = await supabase
      .from('nfc_plates')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      data.forEach((row) => {
        const mapped = mapNfcRow(row, businesses);
        plateMap.set(mapped.id, mapped);
      });
    }
  } catch (err) {
    console.warn('[getNfcPlates Supabase notice]:', err);
  }

  const merged = Array.from(plateMap.values()).map((p) => {
    const matchedBiz = p.merchant_id ? businesses.find((b) => b.id === p.merchant_id) : undefined;
    return {
      ...p,
      merchant_name: matchedBiz?.name || p.merchant_name,
      merchant_slug: matchedBiz?.slug || p.merchant_slug,
      merchant_logo_url: matchedBiz?.logoUrl || p.merchant_logo_url
    };
  });

  saveLocalNfcCache(merged);
  return merged;
}

/**
 * Fetches a single NFC plate by its serial ID
 */
export async function getNfcPlateById(id: string): Promise<NfcPlate | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  // 1. Try Server REST API
  try {
    const res = await fetch(`/api/nfc/${encodeURIComponent(cleanId)}`, { cache: 'no-store' });
    if (res.ok) {
      const serverPlate = await res.json();
      if (serverPlate && serverPlate.id) {
        const mapped = mapNfcRow(serverPlate);
        return mapped;
      }
    }
  } catch {}

  // 2. Try Supabase
  try {
    const { data, error } = await supabase
      .from('nfc_plates')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle();

    if (!error && data) {
      const plate = mapNfcRow(data);
      return plate;
    }
  } catch (err) {
    console.warn('[getNfcPlateById Supabase catch]:', err);
  }

  // 3. Fallback to local cache
  const localCache = getLocalNfcCache();
  const matched = localCache.find((p) => p.id === cleanId);
  return matched || null;
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
  newPlates.forEach((p) => map.set(p.id, p));
  const updatedLocal = Array.from(map.values());
  saveLocalNfcCache(updatedLocal);

  // 2. Persist to Server REST API
  try {
    await fetch('/api/nfc/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
  } catch (e) {}

  // 3. Persist to Supabase
  try {
    await supabase.from('nfc_plates').upsert(rowsToInsert, {
      onConflict: 'id',
      ignoreDuplicates: false
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
 * Links a plate to a merchant and activates it
 */
export async function linkNfcPlate(
  id: string,
  merchantId: string,
  redirectUrl: string
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  // 1. Update local cache
  const localCache = getLocalNfcCache();
  const idx = localCache.findIndex((p) => p.id === id);
  if (idx >= 0) {
    localCache[idx] = {
      ...localCache[idx],
      status: 'active',
      merchant_id: merchantId,
      redirect_url: redirectUrl.trim(),
      updated_at: now
    };
  } else {
    localCache.push({
      id,
      status: 'active',
      merchant_id: merchantId,
      redirect_url: redirectUrl.trim(),
      scan_count: 0,
      created_at: now,
      updated_at: now
    });
  }
  saveLocalNfcCache(localCache);

  // 2. Persist to Server API
  try {
    await fetch('/api/nfc/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, merchantId, redirectUrl })
    });
  } catch (e) {}

  // 3. Persist to Supabase
  try {
    await supabase
      .from('nfc_plates')
      .upsert({
        id,
        status: 'active',
        merchant_id: merchantId || null,
        redirect_url: redirectUrl.trim(),
        updated_at: now
      }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[linkNfcPlate catch]:', err);
  }

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

  // 1. Update local cache
  const localCache = getLocalNfcCache();
  const idx = localCache.findIndex((p) => p.id === id);
  if (idx >= 0) {
    localCache[idx] = {
      ...localCache[idx],
      status: 'inactive',
      merchant_id: null,
      redirect_url: null,
      updated_at: now
    };
    saveLocalNfcCache(localCache);
  }

  // 2. Persist to Server API
  try {
    await fetch('/api/nfc/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch (e) {}

  // 3. Persist to Supabase
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
