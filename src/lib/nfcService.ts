import { supabase } from './supabase';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';
import { Business } from '../types';
import { extractSlugFromUrl, isSamePlateCode, findBestMatchingPlate } from './urlHelper';
import { fetchGlobalCloudData, pushGlobalCloudData } from './cloudSync';
import { getLocalBusinesses, normalizeKey } from './dbService';
export type { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';

const NFC_STORAGE_KEY = 'reputaflow_nfc_plates_cache';

export const INITIAL_NFC_PLATES: NfcPlate[] = [
  {
    id: '001',
    status: 'active',
    merchant_id: 'biz_sbk_barbershop',
    redirect_url: '/r/sbk-barbershop',
    scan_count: 0,
    merchant_name: 'SBK BARBERSHOP',
    merchant_slug: 'sbk-barbershop',
    created_at: '2026-10-27T10:00:00.000Z',
    updated_at: '2026-10-27T10:00:00.000Z'
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
 * Enforces:
 * 1) Only numbered plates (001, 002, 003...) are kept in the plates list (no duplicate slug cards).
 * 2) Plates pointing to a deleted business are reset to inactive.
 * 3) Strictly AT MOST ONE plate per business (if a merchant is linked to 2 plates, only 1 stays active and the duplicate is reset to inactive).
 */
function deduplicateAndSanitizePlates(
  plates: NfcPlate[],
  businesses: Business[] = []
): NfcPlate[] {
  const allBiz = businesses.length > 0 ? businesses : getLocalBusinesses();
  const byNumber = new Map<number, NfcPlate>();

  for (const raw of plates) {
    if (!raw || !raw.id) continue;
    const num = extractPlateNumber(raw.id);
    // Skip non-numeric slug entries so they never duplicate numbered plates
    if (num <= 0) continue;

    const canonicalId = String(num).padStart(3, '0');
    const mapped = mapNfcRow({ ...raw, id: canonicalId }, allBiz);

    // Check if the merchant actually exists in active businesses (not deleted)
    const matchedBiz = allBiz.find(
      (b) =>
        (mapped.merchant_id && b.id === mapped.merchant_id) ||
        (mapped.merchant_slug && b.slug.toLowerCase() === mapped.merchant_slug.toLowerCase()) ||
        (mapped.merchant_name && normalizeKey(b.name) === normalizeKey(mapped.merchant_name))
    );

    // Legacy seed cleanup: Mr. Navalha belongs only on #002 unless explicitly relinked later
    const isLegacyMrNavalhaOnWrongPlate =
      num !== 2 &&
      (mapped.merchant_id === 'biz_mrnavalha' || mapped.merchant_slug === 'mrnavalha');

    let cleaned: NfcPlate;
    if (!matchedBiz || isLegacyMrNavalhaOnWrongPlate) {
      cleaned = {
        ...mapped,
        id: canonicalId,
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        merchant_name: undefined,
        merchant_slug: undefined,
        merchant_logo_url: undefined
      };
    } else {
      cleaned = {
        ...mapped,
        id: canonicalId,
        status: mapped.status === 'active' ? 'active' : 'inactive',
        merchant_id: mapped.status === 'active' ? matchedBiz.id : null,
        merchant_slug: mapped.status === 'active' ? matchedBiz.slug : undefined,
        merchant_name: mapped.status === 'active' ? matchedBiz.name : undefined,
        merchant_logo_url: mapped.status === 'active' ? matchedBiz.logoUrl || undefined : undefined,
        redirect_url: mapped.status === 'active' ? `/r/${encodeURIComponent(matchedBiz.slug)}` : null
      };
    }

    const existing = byNumber.get(num);
    if (!existing) {
      byNumber.set(num, cleaned);
    } else {
      const existingActive = existing.status === 'active' && Boolean(existing.merchant_id);
      const cleanedActive = cleaned.status === 'active' && Boolean(cleaned.merchant_id);
      const existingTime = new Date(existing.updated_at || 0).getTime() || 0;
      const cleanedTime = new Date(cleaned.updated_at || 0).getTime() || 0;

      if (cleanedActive && !existingActive) {
        byNumber.set(num, {
          ...cleaned,
          scan_count: Math.max(existing.scan_count || 0, cleaned.scan_count || 0)
        });
      } else if (cleanedActive && existingActive && cleanedTime >= existingTime) {
        byNumber.set(num, {
          ...cleaned,
          scan_count: Math.max(existing.scan_count || 0, cleaned.scan_count || 0)
        });
      }
    }
  }

  // Sort numerically (001, 002, 003...)
  const sorted = Array.from(byNumber.values()).sort(
    (a, b) => extractPlateNumber(a.id) - extractPlateNumber(b.id)
  );

  // STRICT 1-PLATE-PER-MERCHANT PASS:
  // If any merchant is active on more than 1 plate, keep only the single best plate and reset duplicates to inactive.
  const winningPlateByMerchant = new Map<string, NfcPlate>();
  for (const plate of sorted) {
    if (plate.status === 'active' && (plate.merchant_slug || plate.merchant_id)) {
      const mKey = normalizeKey(plate.merchant_slug || plate.merchant_id || '');
      if (!mKey) continue;

      const prevPlate = winningPlateByMerchant.get(mKey);
      if (!prevPlate) {
        winningPlateByMerchant.set(mKey, plate);
      } else {
        const prevTime = new Date(prevPlate.updated_at || 0).getTime() || 0;
        const currTime = new Date(plate.updated_at || 0).getTime() || 0;
        if (currTime > prevTime) {
          // Current plate is newer; reset previous duplicate plate to inactive
          prevPlate.status = 'inactive';
          prevPlate.merchant_id = null;
          prevPlate.redirect_url = null;
          prevPlate.merchant_name = undefined;
          prevPlate.merchant_slug = undefined;
          prevPlate.merchant_logo_url = undefined;
          winningPlateByMerchant.set(mKey, plate);
        } else {
          // Previous plate wins; reset current duplicate plate to inactive
          plate.status = 'inactive';
          plate.merchant_id = null;
          plate.redirect_url = null;
          plate.merchant_name = undefined;
          plate.merchant_slug = undefined;
          plate.merchant_logo_url = undefined;
        }
      }
    }
  }

  return sorted;
}

function getLocalNfcCache(): NfcPlate[] {
  if (typeof window === 'undefined') return deduplicateAndSanitizePlates(INITIAL_NFC_PLATES);
  try {
    const raw = localStorage.getItem(NFC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateAndSanitizePlates(parsed);
      }
    }
  } catch {}
  return deduplicateAndSanitizePlates(INITIAL_NFC_PLATES);
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
 * Fetches all NFC/QR plates (both active/assigned and inactive stock) with strict 1-plate-per-merchant deduplication
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
        cloudPlates = cloudData.nfcPlates.map((r) => mapNfcRow(r, allBiz));
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

  const combined = [
    ...INITIAL_NFC_PLATES,
    ...supabaseQrPlates,
    ...supabasePlates,
    ...cloudPlates,
    ...serverPlates,
    ...localCache
  ];

  const merged = deduplicateAndSanitizePlates(combined, allBiz);
  saveLocalNfcCache(merged);
  return merged;
}

/**
 * Queries qr_plates, nfc_plates, CloudSync, and local cache to find the highest numeric plate ID in existence.
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

  const existingPlates = await getNfcPlates();
  const highestExisting = await getHighestExistingPlateNumber(existingPlates);
  const safeStartNumber = Math.max(highestExisting + 1, options.startNumber || 1);

  const existingNumbers = new Set<number>(
    existingPlates.map((p) => extractPlateNumber(p.id)).filter((n) => n > 0)
  );

  const now = new Date().toISOString();
  const newPlates: NfcPlate[] = [];
  const nfcRowsToInsert: any[] = [];
  const qrRowsToInsert: any[] = [];

  let currentNum = safeStartNumber;
  while (newPlates.length < quantity) {
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    if (!existingNumbers.has(currentNum)) {
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
  const updatedLocal = deduplicateAndSanitizePlates(
    [...existingPlates, ...newPlates],
    getLocalBusinesses()
  );
  saveLocalNfcCache(updatedLocal);

  await pushGlobalCloudData({
    nfcPlates: updatedLocal,
    maxPlateNumber: highestAfterBatch
  }).catch(() => {});

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

  try {
    await supabase.from('nfc_plates').upsert(nfcRowsToInsert, {
      onConflict: 'id',
      ignoreDuplicates: true
    });
  } catch {}

  try {
    const { error: qrErr } = await supabase.from('qr_plates').upsert(qrRowsToInsert, {
      onConflict: 'qr_code_id',
      ignoreDuplicates: true
    });
    if (qrErr) {
      await supabase.from('qr_plates').upsert(
        qrRowsToInsert.map((r) => ({ qr_code_id: r.qr_code_id, tenant_id: null })),
        { onConflict: 'qr_code_id', ignoreDuplicates: true }
      );
    }
  } catch {}

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
 * Links a plate to a merchant and enforces STRICTLY 1 PLATE PER MERCHANT (unlinks any previous plate of that merchant).
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

  const resolvedMerchantId = selectedBiz?.id || merchantId;
  const slugFromBiz = selectedBiz?.slug;
  const slugFromInput = extractSlugFromUrl(redirectUrl);
  const resolvedSlug = slugFromBiz || slugFromInput || undefined;
  const cleanRedirect = resolvedSlug
    ? `/r/${encodeURIComponent(resolvedSlug)}`
    : (redirectUrl || '').trim() || `/r/${encodeURIComponent(String(merchantId))}`;

  const num = extractPlateNumber(id);
  const canonicalId = num > 0 ? String(num).padStart(3, '0') : id.trim();

  // 1. Update local cache: unlink any other plate previously assigned to this same merchant, then link target plate
  const localCache = await getNfcPlates(allBiz);
  let matchedExact = false;

  for (let i = 0; i < localCache.length; i++) {
    const p = localCache[i];
    if (isSamePlateCode(p.id, canonicalId)) {
      matchedExact = true;
      localCache[i] = {
        ...p,
        id: canonicalId,
        status: 'active',
        merchant_id: resolvedMerchantId,
        redirect_url: cleanRedirect,
        merchant_slug: resolvedSlug,
        merchant_name: selectedBiz?.name,
        merchant_logo_url: selectedBiz?.logoUrl,
        updated_at: now
      };
    } else if (
      (resolvedMerchantId && p.merchant_id === resolvedMerchantId) ||
      (resolvedSlug && p.merchant_slug && p.merchant_slug.toLowerCase() === resolvedSlug.toLowerCase())
    ) {
      // Automatically unlink previous plate for this merchant (1 merchant = 1 plate)
      localCache[i] = {
        ...p,
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

  if (!matchedExact) {
    localCache.push({
      id: canonicalId,
      status: 'active',
      merchant_id: resolvedMerchantId,
      redirect_url: cleanRedirect,
      merchant_slug: resolvedSlug,
      merchant_name: selectedBiz?.name,
      merchant_logo_url: selectedBiz?.logoUrl,
      scan_count: 0,
      created_at: now,
      updated_at: now
    });
  }

  const sanitized = deduplicateAndSanitizePlates(localCache, allBiz);
  saveLocalNfcCache(sanitized);

  // 2. Push to Global Cloud Sync
  try {
    await pushGlobalCloudData({
      businesses: allBiz,
      nfcPlates: sanitized
    });
  } catch {}

  // 3. Persist to Server API
  try {
    await fetch('/api/nfc/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: canonicalId,
        merchantId: resolvedMerchantId,
        redirectUrl: cleanRedirect
      })
    });
  } catch {}

  // 4. Persist to Supabase (unlinking any old plate for this merchant first, then upserting the new one)
  const digits = canonicalId.replace(/\D/g, '').replace(/^0+/, '');
  const codeVariations = Array.from(
    new Set(
      [
        canonicalId,
        digits ? digits.padStart(3, '0') : '',
        digits ? `QRC${digits.padStart(4, '0')}` : ''
      ].filter(Boolean)
    )
  );
  const targetTenantId = resolvedMerchantId || resolvedSlug || null;

  if (targetTenantId) {
    try {
      await supabase
        .from('nfc_plates')
        .update({ status: 'inactive', merchant_id: null, redirect_url: null, updated_at: now })
        .eq('merchant_id', targetTenantId);
    } catch {}
    try {
      await supabase
        .from('qr_plates')
        .update({ tenant_id: null, status: 'inactive', redirect_url: null })
        .eq('tenant_id', targetTenantId);
    } catch {}
  }

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
        await supabase
          .from('qr_plates')
          .upsert(
            {
              qr_code_id: codeVar.toUpperCase(),
              tenant_id: targetTenantId
            },
            { onConflict: 'qr_code_id' }
          );
      }
    } catch {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return { success: true };
}

/**
 * Unlinks all plates pointing to a deleted merchant
 */
export async function unlinkPlatesForMerchant(
  merchantId: string,
  merchantSlug?: string
): Promise<void> {
  const now = new Date().toISOString();
  const localCache = getLocalNfcCache().map((p) => {
    const matchesId = merchantId && p.merchant_id === merchantId;
    const matchesSlug =
      merchantSlug &&
      p.merchant_slug &&
      p.merchant_slug.toLowerCase() === merchantSlug.toLowerCase();
    if (matchesId || matchesSlug) {
      return {
        ...p,
        status: 'inactive' as const,
        merchant_id: null,
        redirect_url: null,
        merchant_name: undefined,
        merchant_slug: undefined,
        merchant_logo_url: undefined,
        updated_at: now
      };
    }
    return p;
  });
  saveLocalNfcCache(localCache);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }
}

/**
 * Unlinks a single plate
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

  const initialLocal = deduplicateAndSanitizePlates(getLocalNfcCache(), businesses);
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
