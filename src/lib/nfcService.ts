import { supabase } from './supabase';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';
import { Business } from '../types';
import { extractSlugFromUrl, isSamePlateCode, findBestMatchingPlate } from './urlHelper';
import { fetchGlobalCloudData, pushGlobalCloudData } from './cloudSync';
import { getLocalBusinesses } from './dbService';
export type { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';

const NFC_STORAGE_KEY = 'reputaflow_nfc_plates_cache';

export const INITIAL_NFC_PLATES: NfcPlate[] = [
  {
    id: '001',
    status: 'inactive',
    merchant_id: null,
    redirect_url: null,
    scan_count: 0,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z'
  },
  {
    id: '002',
    status: 'active',
    merchant_id: 'biz_mrnavalha',
    redirect_url: '/r/mrnavalha',
    scan_count: 3,
    merchant_name: 'Mr. Navalha',
    merchant_slug: 'mrnavalha',
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T12:00:00.000Z'
  },
  {
    id: '003',
    status: 'inactive',
    merchant_id: null,
    redirect_url: null,
    scan_count: 0,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z'
  },
  {
    id: '004',
    status: 'inactive',
    merchant_id: null,
    redirect_url: null,
    scan_count: 0,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z'
  },
  {
    id: '005',
    status: 'inactive',
    merchant_id: null,
    redirect_url: null,
    scan_count: 0,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z'
  }
];

/**
 * Extracts numeric value from a plate ID (e.g. "QRC0005" -> 5, "#005" -> 5, "005" -> 5)
 */
export function extractPlateNumber(idOrCode: string): number {
  if (!idOrCode) return 0;
  const digits = String(idOrCode).replace(/\D/g, '');
  if (!digits) return 0;
  const num = parseInt(digits, 10);
  return isNaN(num) || num > 100000 ? 0 : num;
}

/**
 * Cleans up legacy hardcoded seed assignments where 001, 003, 004, 005 were pre-populated with Mr. Navalha.
 * Preserves any active plate that has a valid tenant_id / merchant_id.
 */
function sanitizePlatesList(plates: NfcPlate[], businesses: Business[] = []): NfcPlate[] {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  return plates.map((p) => {
    if (!p || !p.id) return p;
    const isPlate2 = isSamePlateCode(p.id, 'QRC0002') || p.id.toLowerCase() === 'mrnavalha';
    const isLegacySeedTimestamp =
      p.updated_at === '2026-09-21T12:00:00.000Z' ||
      (p.created_at === '2026-09-21T10:00:00.000Z' && String(p.updated_at || '').startsWith('2026-09-21'));

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
  if (typeof window === 'undefined') return INITIAL_NFC_PLATES;
  try {
    const raw = localStorage.getItem(NFC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizePlatesList(parsed);
      }
    }
  } catch {}
  return sanitizePlatesList(INITIAL_NFC_PLATES);
}

function saveLocalNfcCache(plates: NfcPlate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NFC_STORAGE_KEY, JSON.stringify(plates));
  } catch {}
}

/**
 * Synchronous fast-lookup for a QR code by merchant slug, business ID, or plate code.
 */
export function findFastNfcPlate(idOrCode: string): NfcPlate | null {
  if (!idOrCode) return null;
  const clean = idOrCode.trim();
  const cleanLower = clean.toLowerCase();

  // 1. Direct match against registered businesses by slug or id
  const allBiz = getLocalBusinesses();
  const directBiz = allBiz.find(
    (b) =>
      b.slug.toLowerCase() === cleanLower ||
      b.id.toLowerCase() === cleanLower ||
      (b.ownerId && b.ownerId.toLowerCase() === cleanLower)
  );
  if (directBiz) {
    return {
      id: directBiz.slug,
      status: 'active',
      merchant_id: directBiz.id,
      redirect_url: `/r/${encodeURIComponent(directBiz.slug)}`,
      scan_count: 0,
      merchant_name: directBiz.name,
      merchant_slug: directBiz.slug,
      merchant_logo_url: directBiz.logoUrl || undefined,
      created_at: directBiz.createdAt || new Date().toISOString(),
      updated_at: directBiz.updatedAt || new Date().toISOString()
    };
  }

  // 2. Check sanitized local storage cache
  const localList = getLocalNfcCache();
  const fromLocal = findBestMatchingPlate(localList, clean);
  if (fromLocal && fromLocal.status === 'active') {
    return fromLocal;
  }

  return null;
}

export function mapNfcRow(row: any, businesses: Business[] = []): NfcPlate {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  const rawId = String(row.id || row.qr_code_id || row.code || '').trim();
  const mId =
    row.merchant_id ||
    row.merchantId ||
    row.tenant_id ||
    row.tenantId ||
    row.business_id ||
    row.establishment_id ||
    null;
  const redir = row.redirect_url || row.redirectUrl || null;
  const slugFromUrl = extractSlugFromUrl(redir);
  const slugFromJoin =
    row.tenants?.slug ||
    (Array.isArray(row.tenants) ? row.tenants[0]?.slug : null) ||
    row.businesses?.slug ||
    (Array.isArray(row.businesses) ? row.businesses[0]?.slug : null) ||
    row.establishments?.slug ||
    (Array.isArray(row.establishments) ? row.establishments[0]?.slug : null) ||
    null;

  const bizById = mId
    ? allBiz.find(
        (b) =>
          b.id === mId ||
          (b.ownerId && b.ownerId === mId) ||
          b.slug.toLowerCase() === String(mId).toLowerCase()
      )
    : undefined;
  const targetSlug = slugFromJoin || slugFromUrl;
  const bizBySlug = targetSlug
    ? allBiz.find(
        (b) =>
          b.slug.toLowerCase() === String(targetSlug).toLowerCase() ||
          b.id === targetSlug
      )
    : undefined;

  let matchedBiz = bizById || bizBySlug;
  if (bizById && bizById.id !== 'biz_mrnavalha') {
    matchedBiz = bizById;
  } else if (bizBySlug && bizBySlug.id !== 'biz_mrnavalha') {
    matchedBiz = bizBySlug;
  }

  const mIdLooksLikeSlug =
    mId &&
    typeof mId === 'string' &&
    !mId.startsWith('biz_') &&
    !mId.startsWith('owner_') &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(mId)
      ? mId.trim()
      : null;

  const resolvedSlug =
    slugFromJoin ||
    (bizById && bizById.id !== 'biz_mrnavalha' ? bizById.slug : null) ||
    (slugFromUrl && slugFromUrl !== 'mrnavalha' ? slugFromUrl : null) ||
    matchedBiz?.slug ||
    slugFromUrl ||
    row.merchant_slug ||
    row.merchantSlug ||
    mIdLooksLikeSlug ||
    undefined;

  const hasTarget = Boolean(mId || redir || resolvedSlug);
  const rawStatus = String(row.status || '').trim().toLowerCase();
  const isStatusActive =
    (rawStatus === 'active' || (rawStatus !== 'inactive' && rawStatus !== 'unlinked' && hasTarget)) &&
    hasTarget;

  const finalRedirect = resolvedSlug
    ? `/r/${encodeURIComponent(resolvedSlug)}`
    : redir || (mId ? `/r/${encodeURIComponent(String(mId))}` : null);

  return {
    id: rawId,
    status: isStatusActive ? 'active' : 'inactive',
    merchant_id: isStatusActive ? matchedBiz?.id || mId : null,
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
 * Merges multiple plate lists, ensuring active/assigned plates NEVER get overwritten by inactive records.
 */
function mergePlatesLists(businesses: Business[], ...lists: NfcPlate[][]): NfcPlate[] {
  const byCanonicalKey = new Map<string, NfcPlate>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const rawItem of list) {
      if (!rawItem || !rawItem.id) continue;
      const item = mapNfcRow(rawItem, businesses);
      const num = extractPlateNumber(item.id);
      // Group normalized numeric plates together (e.g. "004" and "QRC0004" -> canonical key "NUM_4")
      const key = num > 0 ? `NUM_${num}` : item.id.toUpperCase();
      const existing = byCanonicalKey.get(key);

      if (!existing) {
        // Normalize display ID for numeric plates to 3-digit padded format ("001", "002", ...) unless it has a custom prefix
        const normalizedId =
          num > 0 && /^(?:QRC|0|#)/i.test(item.id)
            ? String(num).padStart(3, '0')
            : item.id;
        byCanonicalKey.set(key, { ...item, id: normalizedId });
      } else {
        const existingActive =
          existing.status === 'active' &&
          Boolean(existing.merchant_slug || existing.redirect_url || existing.merchant_id);
        const itemActive =
          item.status === 'active' &&
          Boolean(item.merchant_slug || item.redirect_url || item.merchant_id);
        const existingTime = new Date(existing.updated_at || 0).getTime() || 0;
        const itemTime = new Date(item.updated_at || 0).getTime() || 0;

        // PROTECT ASSIGNED PLATES: Active plate ALWAYS wins over inactive plate
        if (itemActive && !existingActive) {
          byCanonicalKey.set(key, {
            ...existing,
            ...item,
            id: existing.id,
            scan_count: Math.max(existing.scan_count || 0, item.scan_count || 0)
          });
        } else if (itemActive && existingActive && itemTime >= existingTime) {
          byCanonicalKey.set(key, {
            ...existing,
            ...item,
            id: existing.id,
            scan_count: Math.max(existing.scan_count || 0, item.scan_count || 0)
          });
        }
      }
    }
  }

  const result = sanitizePlatesList(Array.from(byCanonicalKey.values()), businesses);

  // Sort numerically (001, 002, 003...) then alphabetically
  return result.sort((a, b) => {
    const numA = extractPlateNumber(a.id);
    const numB = extractPlateNumber(b.id);
    if (numA > 0 && numB > 0) return numA - numB;
    if (numA > 0) return -1;
    if (numB > 0) return 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Fetches all NFC/QR plates (both active/assigned and inactive stock) from Local Cache, Cloud Sync, Server API & Supabase
 */
export async function getNfcPlates(businesses: Business[] = []): Promise<NfcPlate[]> {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  const localCache = getLocalNfcCache();
  let serverPlates: NfcPlate[] = [];
  let cloudPlates: NfcPlate[] = [];
  let supabasePlates: NfcPlate[] = [];
  let supabaseQrPlates: NfcPlate[] = [];

  // 1. Try Server REST API
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

  // 2. Try Global Cloud Sync
  const cloudPromise = (async () => {
    try {
      const cloudData = await fetchGlobalCloudData();
      if (cloudData && Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
        cloudPlates = sanitizePlatesList(cloudData.nfcPlates, allBiz);
      }
    } catch {}
  })();

  // 3. Try Supabase (both nfc_plates and qr_plates)
  const supabasePromise = (async () => {
    try {
      const { data, error } = await supabase.from('nfc_plates').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        supabasePlates = data.map((r) => mapNfcRow(r, allBiz));
      }
    } catch {}
    try {
      const { data: qrData, error: qrErr } = await supabase.from('qr_plates').select('*');
      if (!qrErr && Array.isArray(qrData) && qrData.length > 0) {
        supabaseQrPlates = qrData.map((r) => mapNfcRow(r, allBiz));
      }
    } catch {}
  })();

  await Promise.all([serverPromise, cloudPromise, supabasePromise]);

  // Ensure default first custom merchant is linked to #001 if #001 is still unlinked and custom merchant exists
  const customBiz = allBiz.filter((b) => b && b.slug && b.slug !== 'mrnavalha');
  const defaultSeed = INITIAL_NFC_PLATES.map((p) => {
    if (p.id === '001' && customBiz.length > 0) {
      return {
        ...p,
        status: 'active' as const,
        merchant_id: customBiz[0].id,
        merchant_slug: customBiz[0].slug,
        merchant_name: customBiz[0].name,
        merchant_logo_url: customBiz[0].logoUrl,
        redirect_url: `/r/${customBiz[0].slug}`,
        updated_at: customBiz[0].updatedAt || new Date().toISOString()
      };
    }
    return p;
  });

  const merged = mergePlatesLists(
    allBiz,
    defaultSeed,
    localCache,
    serverPlates,
    cloudPlates,
    supabasePlates,
    supabaseQrPlates
  );

  saveLocalNfcCache(merged);
  return merged;
}

/**
 * Queries qr_plates, nfc_plates, CloudSync, and local cache to find the highest numeric plate ID in existence.
 * E.g. if #005 exists, returns 5 so the next batch obligatorily starts at #006.
 */
export async function getHighestExistingPlateNumber(currentPlates: NfcPlate[] = []): Promise<number> {
  let highest = 0;

  const scanList = (list: any[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const code = String(item?.id || item?.qr_code_id || item?.code || '');
      const n = extractPlateNumber(code);
      if (n > highest) highest = n;
    }
  };

  scanList(currentPlates);
  scanList(getLocalNfcCache());

  try {
    const { data: qrRows } = await supabase.from('qr_plates').select('qr_code_id');
    if (Array.isArray(qrRows)) scanList(qrRows);
  } catch {}

  try {
    const { data: nfcRows } = await supabase.from('nfc_plates').select('id');
    if (Array.isArray(nfcRows)) scanList(nfcRows);
  } catch {}

  try {
    const cloud = await fetchGlobalCloudData();
    if (cloud?.maxPlateNumber && cloud.maxPlateNumber > highest) {
      highest = cloud.maxPlateNumber;
    }
    if (Array.isArray(cloud?.nfcPlates)) {
      scanList(cloud!.nfcPlates);
    }
  } catch {}

  return Math.max(highest, 5);
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
 * SAFE BATCH GENERATOR:
 * 1. Queries qr_plates & nfc_plates first to find the highest existing plate number (e.g. #005 -> starts at #006).
 * 2. NEVER overwrites, modifies, or unlinks plates that already have tenant_id / merchant_id assigned.
 */
export async function createNfcPlatesBatch(
  options: CreateNfcBatchOptions
): Promise<{
  success: boolean;
  createdCount: number;
  startSerial?: string;
  endSerial?: string;
  error?: string;
}> {
  const { quantity, prefix = '', padDigits = 3 } = options;

  if (quantity < 1 || quantity > 500) {
    return {
      success: false,
      createdCount: 0,
      error: 'A quantidade deve situar-se entre 1 e 500 placas por lote.'
    };
  }

  // PASSO 2: Consultar a base de dados antes de inserir para encontrar o número mais alto já existente
  const existingPlates = await getNfcPlates();
  const highestExisting = await getHighestExistingPlateNumber(existingPlates);
  const safeStartNumber = Math.max(highestExisting + 1, options.startNumber || 1);

  const existingNumbers = new Set<number>(
    existingPlates.map((p) => extractPlateNumber(p.id)).filter((n) => n > 0)
  );
  const existingIdsUpper = new Set<string>(existingPlates.map((p) => p.id.toUpperCase()));

  const now = new Date().toISOString();
  const newPlates: NfcPlate[] = [];
  const nfcRowsToInsert: any[] = [];
  const qrRowsToInsert: any[] = [];

  let currentNum = safeStartNumber;
  while (newPlates.length < quantity) {
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    // Never touch or overwrite an existing plate number or ID
    if (!existingNumbers.has(currentNum) && !existingIdsUpper.has(id.toUpperCase())) {
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
      nfcRowsToInsert.push({
        id,
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        scan_count: 0,
        created_at: now,
        updated_at: now
      });
      qrRowsToInsert.push({
        qr_code_id: `QRC${String(currentNum).padStart(4, '0')}`,
        tenant_id: null,
        status: 'inactive',
        redirect_url: null
      });
    }
    currentNum++;
  }

  const highestAfterBatch = currentNum - 1;

  // 1. Merge into local cache preserving 100% of existing active/assigned plates
  const updatedLocal = mergePlatesLists(getLocalBusinesses(), existingPlates, newPlates);
  saveLocalNfcCache(updatedLocal);

  // 2. Push to Cloud Sync (preserving all businesses + active plate bindings + new maxPlateNumber)
  await pushGlobalCloudData({
    nfcPlates: updatedLocal,
    maxPlateNumber: highestAfterBatch
  }).catch(() => {});

  // 3. Persist to Server REST API
  try {
    await fetch('/api/nfc/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...options,
        startNumber: safeStartNumber
      })
    });
  } catch {}

  // 4. Persist to Supabase (`nfc_plates` and `qr_plates` with ignoreDuplicates: true so assigned rows are never touched)
  try {
    await supabase.from('nfc_plates').upsert(nfcRowsToInsert, {
      onConflict: 'id',
      ignoreDuplicates: true
    });
  } catch (err) {
    console.warn('[Supabase nfc_plates batch notice]:', err);
  }

  try {
    const { error: qrErr } = await supabase.from('qr_plates').upsert(qrRowsToInsert, {
      onConflict: 'qr_code_id',
      ignoreDuplicates: true
    });
    if (qrErr) {
      // Minimal column fallback if qr_plates only has qr_code_id and tenant_id
      await supabase.from('qr_plates').upsert(
        qrRowsToInsert.map((r) => ({ qr_code_id: r.qr_code_id, tenant_id: null })),
        { onConflict: 'qr_code_id', ignoreDuplicates: true }
      );
    }
  } catch (err) {
    console.warn('[Supabase qr_plates batch notice]:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return {
    success: true,
    createdCount: newPlates.length,
    startSerial: newPlates[0]?.id,
    endSerial: newPlates[newPlates.length - 1]?.id
  };
}

/**
 * Links a plate to a merchant and activates it across LocalStorage, CloudSync, Server API, and Supabase
 */
export async function linkNfcPlate(
  id: string,
  merchantId: string,
  redirectUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const allBiz = getLocalBusinesses();
  const selectedBiz = allBiz.find(
    (b) => b.id === merchantId || b.slug.toLowerCase() === String(merchantId).toLowerCase()
  );

  const slugFromBiz = selectedBiz?.slug;
  const slugFromInput = extractSlugFromUrl(redirectUrl);
  const resolvedSlug = slugFromBiz || slugFromInput || undefined;
  const cleanRedirect = resolvedSlug
    ? `/r/${encodeURIComponent(resolvedSlug)}`
    : (redirectUrl || '').trim() || `/r/${encodeURIComponent(String(merchantId))}`;

  // 1. Update local cache
  const localCache = await getNfcPlates(allBiz);
  let matchedExact = false;

  for (let i = 0; i < localCache.length; i++) {
    if (isSamePlateCode(localCache[i].id, id)) {
      matchedExact = true;
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
    const num = extractPlateNumber(id);
    const normalizedId = num > 0 ? String(num).padStart(3, '0') : id.trim();
    localCache.push({
      id: normalizedId,
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

  // 2. Immediately push to Global Cloud Sync
  try {
    await pushGlobalCloudData({
      businesses: allBiz,
      nfcPlates: localCache
    });
  } catch {}

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
  } catch {}

  // 4. Persist to Supabase (nfc_plates and qr_plates)
  const cleanId = id.trim();
  const digits = cleanId.replace(/\D/g, '').replace(/^0+/, '');
  const codeVariations = Array.from(
    new Set(
      [
        cleanId,
        cleanId.toUpperCase(),
        digits ? digits.padStart(3, '0') : '',
        digits ? `QRC${digits.padStart(4, '0')}` : ''
      ].filter(Boolean)
    )
  );
  const targetTenantId = selectedBiz?.id || merchantId || resolvedSlug || null;

  for (const codeVar of codeVariations) {
    try {
      await supabase
        .from('nfc_plates')
        .upsert(
          {
            id: codeVar,
            status: 'active',
            merchant_id: targetTenantId,
            redirect_url: cleanRedirect,
            updated_at: now
          },
          { onConflict: 'id' }
        );
    } catch {}

    try {
      const { error: qrErr } = await supabase
        .from('qr_plates')
        .upsert(
          {
            qr_code_id: codeVar.toUpperCase(),
            tenant_id: targetTenantId,
            status: 'active',
            redirect_url: cleanRedirect
          },
          { onConflict: 'qr_code_id' }
        );

      if (qrErr) {
        const { error: minimalUpsertErr } = await supabase
          .from('qr_plates')
          .upsert(
            {
              qr_code_id: codeVar.toUpperCase(),
              tenant_id: targetTenantId
            },
            { onConflict: 'qr_code_id' }
          );

        if (minimalUpsertErr) {
          await supabase
            .from('qr_plates')
            .update({ tenant_id: targetTenantId })
            .ilike('qr_code_id', `%${codeVar}%`);
        }
      }
    } catch {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return { success: true };
}

/**
 * Unlinks a single plate (only when explicitly requested by admin)
 */
export async function unlinkNfcPlate(id: string): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

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

  pushGlobalCloudData({ nfcPlates: localCache }).catch(() => {});

  try {
    await fetch('/api/nfc/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch {}

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
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return { success: true };
}

/**
 * Deletes an inactive NFC plate
 */
export async function deleteNfcPlate(id: string): Promise<{ success: boolean; error?: string }> {
  const localCache = getLocalNfcCache().filter((p) => !isSamePlateCode(p.id, id));
  saveLocalNfcCache(localCache);

  try {
    await fetch(`/api/nfc/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {}

  try {
    await supabase.from('nfc_plates').delete().eq('id', id);
  } catch {}

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

  const localCache = getLocalNfcCache();
  const idx = localCache.findIndex((p) => isSamePlateCode(p.id, cleanId));
  if (idx >= 0) {
    localCache[idx].scan_count = (localCache[idx].scan_count || 0) + 1;
    saveLocalNfcCache(localCache);
  }

  try {
    await fetch(`/api/nfc/scan/${encodeURIComponent(cleanId)}`, { method: 'POST' });
  } catch {}

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
