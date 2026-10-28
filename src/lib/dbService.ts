import {
  Business,
  Review,
  Feedback,
  RecoveryCase,
  RecoveryCaseStatus,
  Customer,
  Interaction,
  Plan,
  PlatformSettings
} from '../types/index.ts';
import { supabase, uploadBusinessLogo } from './supabase.ts';
import { slugify } from './urlHelper.ts';
import { fetchGlobalCloudData, pushGlobalCloudData } from './cloudSync.ts';
import {
  REGISTERED_BUSINESSES as INITIAL_BIZ,
  INITIAL_CUSTOMERS,
  INITIAL_REVIEWS,
  INITIAL_FEEDBACK,
  INITIAL_RECOVERY_CASES
} from './initialData.ts';

export const REGISTERED_BUSINESSES: Business[] = [...INITIAL_BIZ];

// ==========================================
// STRING & ID NORMALIZATION UTILS
// ==========================================
export function normalizeKey(str: string = ''): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isMatchingBusiness(itemBizId: string | undefined, targetBizId: string | null): boolean {
  if (!targetBizId) return true;
  if (!itemBizId) return false;
  if (itemBizId === targetBizId) return true;
  const a = itemBizId.toLowerCase().trim();
  const b = targetBizId.toLowerCase().trim();
  if (a === b) return true;
  const aNorm = a.replace(/[^a-z0-9]/g, '').replace(/^biz/, '');
  const bNorm = b.replace(/[^a-z0-9]/g, '').replace(/^biz/, '');
  if (aNorm && bNorm && aNorm === bNorm) return true;
  return false;
}

const LOCAL_BUSINESSES_STORAGE_KEY = 'reputaflow_persisted_businesses_v1';
const LOCAL_DELETED_BUSINESSES_KEY = 'reputaflow_deleted_businesses_v1';

function readDeletedBusinessKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_BUSINESSES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((x) => String(x).toLowerCase().trim()).filter(Boolean));
    }
  } catch {}
  return new Set();
}

function markBusinessKeyDeleted(idOrSlugOrName: string) {
  if (typeof window === 'undefined' || !idOrSlugOrName) return;
  try {
    const set = readDeletedBusinessKeys();
    const raw = idOrSlugOrName.toLowerCase().trim();
    const norm = normalizeKey(idOrSlugOrName);
    if (raw) set.add(raw);
    if (norm) set.add(norm);
    localStorage.setItem(LOCAL_DELETED_BUSINESSES_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function unmarkBusinessKeyDeleted(id: string, slug: string, name?: string) {
  if (typeof window === 'undefined') return;
  try {
    const set = readDeletedBusinessKeys();
    set.delete(id.toLowerCase().trim());
    set.delete(normalizeKey(id));
    if (slug) {
      set.delete(slug.toLowerCase().trim());
      set.delete(normalizeKey(slug));
    }
    if (name) {
      set.delete(name.toLowerCase().trim());
      set.delete(normalizeKey(name));
    }
    localStorage.setItem(LOCAL_DELETED_BUSINESSES_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function readCachedBusinesses(): Business[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_BUSINESSES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((b) => b && b.id && b.name);
      }
    }
  } catch (e) {
    console.warn('[readCachedBusinesses notice]:', e);
  }
  return [];
}

function saveCachedBusinesses(list: Business[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_BUSINESSES_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[saveCachedBusinesses notice]:', e);
  }
}

function mergeBusinessLists(...lists: Business[][]): Business[] {
  const deleted = readDeletedBusinessKeys();
  const byCanonicalKey = new Map<string, Business>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !item.name) continue;
      const cleanId = String(item.id || '').trim();
      const cleanSlug = String(item.slug || slugify(item.name)).toLowerCase().trim();
      const cleanNameKey = normalizeKey(item.name);
      if (!cleanId) continue;

      if (
        deleted.has(cleanId.toLowerCase()) ||
        deleted.has(normalizeKey(cleanId)) ||
        (cleanSlug && (deleted.has(cleanSlug) || deleted.has(normalizeKey(cleanSlug)))) ||
        (cleanNameKey && deleted.has(cleanNameKey))
      ) {
        continue;
      }

      // Match existing entry by ID, slug, or normalized name so local & DB records never duplicate
      let matchKey = cleanSlug || cleanNameKey || cleanId;
      for (const [k, v] of byCanonicalKey.entries()) {
        if (
          v.id === cleanId ||
          v.slug.toLowerCase() === cleanSlug ||
          normalizeKey(v.name) === cleanNameKey
        ) {
          matchKey = k;
          break;
        }
      }

      const existing = byCanonicalKey.get(matchKey);

      if (!existing) {
        byCanonicalKey.set(matchKey, { ...item, slug: cleanSlug || item.slug });
      } else {
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const itemTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
        const winner = itemTime >= existingTime ? item : existing;
        const loser = itemTime >= existingTime ? existing : item;

        const merged: Business = {
          ...loser,
          ...winner,
          id: existing.id,
          slug: existing.slug || winner.slug,
          logoUrl: winner.logoUrl || loser.logoUrl || '',
          googleReviewUrl: winner.googleReviewUrl || loser.googleReviewUrl || '',
          phone: winner.phone || loser.phone || '',
          address: winner.address || loser.address || '',
          email: winner.email || loser.email || ''
        };
        byCanonicalKey.set(matchKey, merged);
      }
    }
  }

  return Array.from(byCanonicalKey.values());
}

// In-memory runtime state initialized from localStorage + baseline fallback
let runtimeBusinesses: Business[] = mergeBusinessLists(readCachedBusinesses(), [...INITIAL_BIZ]);
let runtimeReviews: Review[] = [...INITIAL_REVIEWS];
let runtimeFeedback: Feedback[] = [...INITIAL_FEEDBACK];
let runtimeRecoveryCases: RecoveryCase[] = [...INITIAL_RECOVERY_CASES];
let runtimeCustomers: Customer[] = [...INITIAL_CUSTOMERS];

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_live_sync'));
  }
}

// ==========================================
// IMAGE UPLOAD SERVICE (SUPABASE STORAGE ONLY)
// ==========================================
export async function uploadImage(file: File, businessId?: string): Promise<string> {
  const currentMerchantId = businessId || 'biz';
  const publicUrl = await uploadBusinessLogo(file, currentMerchantId);

  if (businessId && businessId !== 'biz' && businessId !== 'new_biz') {
    try {
      await updateBusiness(businessId, { logoUrl: publicUrl });
    } catch {}
  }

  notifyDataChanged();
  return publicUrl;
}

// ==========================================
// BUSINESSES / MERCHANTS SERVICE
// ==========================================
function mapBusinessRow(row: any): Business {
  return {
    id: String(row.id || ''),
    name: String(row.name || row.business_name || row.title || ''),
    slug: String(row.slug || normalizeKey(row.name || String(row.id || ''))),
    category: row.category || 'Comércio & Serviços',
    address: row.address || '',
    phone: row.phone || row.whatsapp || '',
    email: row.email || '',
    googleReviewUrl: row.google_review_url || row.googleReviewUrl || row.google_url || '',
    logoUrl: row.logo_url || row.logoUrl || '',
    bannerUrl: row.banner_url || row.bannerUrl || '',
    minRatingForGoogle: Number(row.min_rating_for_google ?? row.minRatingForGoogle ?? 4),
    qrThemeColor: row.qr_theme_color || row.qrThemeColor || '#4f46e5',
    activePlan: row.active_plan || row.activePlan || row.plan_id || 'pro',
    planId: row.plan_id || row.planId || 'plan_pro',
    ownerId: row.owner_id || row.ownerId || row.tenant_id || '',
    currency: (row.currency as 'EUR' | 'BRL') || 'EUR',
    status: (row.status as any) || (row.is_active === false ? 'suspended' : 'active'),
    password: row.password || 'reputa123',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || row.created_at || row.createdAt || new Date().toISOString()
  };
}

// Adaptive Supabase insert helper that automatically strips unsupported columns or non-UUID keys
async function insertBusinessToSupabaseAdaptive(tableName: string, basePayload: Record<string, any>): Promise<boolean> {
  let currentPayload = { ...basePayload };

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const { error } = await supabase.from(tableName).insert([currentPayload]);
      if (!error) {
        return true;
      }

      const msg = error.message || '';
      const code = error.code || '';

      // If table does not exist at all, stop trying this table
      if (code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'))) {
        return false;
      }

      // If duplicate key (already exists), treat as success
      if (code === '23505' || msg.includes('duplicate key')) {
        return true;
      }

      // Check if error is about a missing column in schema cache (PGRST204 or 42703)
      const colMatch =
        msg.match(/Could not find the '([^']+)' column/i) ||
        msg.match(/column "([^"]+)" of relation/i) ||
        msg.match(/column '([^']+)'/i);

      if (colMatch && colMatch[1] && colMatch[1] in currentPayload) {
        delete currentPayload[colMatch[1]];
        continue;
      }

      // Check if error is UUID syntax (22P02) or Foreign Key constraint (23503)
      if (code === '22P02' || code === '23503' || msg.includes('uuid') || msg.includes('foreign key')) {
        if ('owner_id' in currentPayload) {
          delete currentPayload.owner_id;
          continue;
        }
        if ('tenant_id' in currentPayload) {
          delete currentPayload.tenant_id;
          continue;
        }
        if ('id' in currentPayload && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(currentPayload.id))) {
          delete currentPayload.id;
          continue;
        }
      }

      // Progressive fallback to minimal columns if other schema error occurred
      if (attempt === 4) {
        currentPayload = {
          name: basePayload.name,
          slug: basePayload.slug,
          phone: basePayload.phone,
          email: basePayload.email,
          google_review_url: basePayload.google_review_url,
          logo_url: basePayload.logo_url,
          status: basePayload.status
        };
        continue;
      }
      if (attempt === 5) {
        currentPayload = {
          name: basePayload.name,
          slug: basePayload.slug
        };
        continue;
      }

      break;
    } catch {
      break;
    }
  }
  return false;
}

// Helper for safe isolated Supabase realtime subscriptions
function createSafeTableSubscription(tableName: string, onUpdate: () => void): () => void {
  const channelName = `rt_${tableName}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let channel: any = null;

  try {
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
        onUpdate();
      })
      .subscribe();
  } catch (err) {
    console.warn(`[Supabase Realtime Channel init on ${tableName}]:`, err);
  }

  return () => {
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
  };
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  let isSubscribed = true;

  // Emit initial state while live Supabase fetch runs
  const initialMerged = mergeBusinessLists(readCachedBusinesses(), runtimeBusinesses, [...INITIAL_BIZ]);
  runtimeBusinesses = initialMerged;
  callback(runtimeBusinesses);

  const fetchMerchants = async () => {
    const deleted = readDeletedBusinessKeys();
    const cachedLocal = readCachedBusinesses();

    // 1. PRIMARY SINGLE SOURCE OF TRUTH: SUPABASE
    try {
      const { data: supaRows, error: supaErr } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });

      if (!supaErr && Array.isArray(supaRows) && supaRows.length > 0) {
        const supaMapped = supaRows
          .map(mapBusinessRow)
          .filter(
            (b) =>
              b &&
              b.id &&
              !deleted.has(b.id.toLowerCase()) &&
              !deleted.has((b.slug || '').toLowerCase()) &&
              !deleted.has(normalizeKey(b.name || ''))
          );

        // If local browser had richer fields for any existing merchant in Supabase (or SBK BARBERSHOP), merge and sync up to Supabase
        const enrichedList = supaMapped.map((sb) => {
          const localMatch = cachedLocal.find(
            (lb) =>
              lb.id === sb.id ||
              (lb.slug && lb.slug.toLowerCase() === sb.slug.toLowerCase()) ||
              normalizeKey(lb.name) === normalizeKey(sb.name)
          );
          if (!localMatch) return sb;

          const needsPatch =
            (localMatch.googleReviewUrl && !sb.googleReviewUrl) ||
            (localMatch.phone && !sb.phone) ||
            (localMatch.address && !sb.address) ||
            (localMatch.logoUrl && !sb.logoUrl);

          const mergedBiz: Business = {
            ...sb,
            logoUrl: sb.logoUrl || localMatch.logoUrl || '',
            googleReviewUrl: sb.googleReviewUrl || localMatch.googleReviewUrl || '',
            phone: sb.phone || localMatch.phone || '',
            address: sb.address || localMatch.address || '',
            email: sb.email || localMatch.email || ''
          };

          if (needsPatch) {
            supabase
              .from('businesses')
              .update({
                logo_url: mergedBiz.logoUrl || null,
                google_review_url: mergedBiz.googleReviewUrl || null,
                phone: mergedBiz.phone || '',
                address: mergedBiz.address || '',
                email: mergedBiz.email || '',
                updated_at: new Date().toISOString()
              })
              .eq('id', sb.id)
              .then(() => {});
          }

          return mergedBiz;
        });

        // Deduplicate by slug/name strictly from Supabase truth (never resurrect deleted local ghosts)
        const dedupedTruth = mergeBusinessLists(enrichedList);
        runtimeBusinesses = dedupedTruth;
        saveCachedBusinesses(dedupedTruth);

        if (isSubscribed) {
          callback(runtimeBusinesses);
        }
        return;
      }
    } catch (supaErr) {
      console.warn('[subscribeBusinesses Supabase primary check]:', supaErr);
    }

    // 2. FALLBACK IF SUPABASE IS OFFLINE: Server API + CloudSync
    let apiBusinesses: Business[] = [];
    let cloudBusinesses: Business[] = [];

    try {
      const apiRes = await fetch('/api/businesses', { cache: 'no-store' }).catch(() => null);
      const contentType = apiRes?.headers?.get('content-type') || '';
      if (apiRes && apiRes.ok && contentType.includes('application/json')) {
        const apiData = await apiRes.json();
        if (Array.isArray(apiData)) {
          apiBusinesses = apiData.map(mapBusinessRow);
        }
      }
    } catch {}

    try {
      const cloudData = await fetchGlobalCloudData();
      if (cloudData && Array.isArray(cloudData.businesses) && cloudData.businesses.length > 0) {
        cloudBusinesses = cloudData.businesses.map(mapBusinessRow);
      }
    } catch {}

    const fallbackMerged = mergeBusinessLists(
      apiBusinesses,
      cloudBusinesses,
      cachedLocal,
      [...INITIAL_BIZ]
    );
    runtimeBusinesses = fallbackMerged;
    saveCachedBusinesses(fallbackMerged);
    if (isSubscribed) {
      callback(runtimeBusinesses);
    }
  };

  fetchMerchants();

  const unsubscribeRealtime = createSafeTableSubscription('businesses', fetchMerchants);
  const interval = setInterval(fetchMerchants, 4000);

  const handleCustomEvent = () => {
    fetchMerchants();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
    window.addEventListener('reputaflow_businesses_updated', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
      window.removeEventListener('reputaflow_businesses_updated', handleCustomEvent);
    }
  };
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const clean = slug ? slug.trim() : '';
  const normSlug = normalizeKey(clean);
  if (!normSlug) return null;

  // 1. PRIMARY SINGLE SOURCE OF TRUTH: SUPABASE (Fresh query with no-store)
  try {
    const { data, error } = await supabase.from('businesses').select('*');
    if (!error && Array.isArray(data) && data.length > 0) {
      const mappedList = data.map(mapBusinessRow);
      const match = mappedList.find(
        (b) =>
          normalizeKey(b.slug) === normSlug ||
          normalizeKey(b.id) === normSlug ||
          normalizeKey(b.ownerId || '') === normSlug ||
          normalizeKey(b.name) === normSlug
      );
      if (match) {
        runtimeBusinesses = mergeBusinessLists(mappedList);
        saveCachedBusinesses(runtimeBusinesses);
        return match;
      }
    }
  } catch {}

  // 2. Fallback: Server REST API (/api/businesses/:slug)
  try {
    const apiRes = await fetch(`/api/businesses/${encodeURIComponent(clean)}?_v=${Date.now()}`, {
      cache: 'no-store'
    }).catch(() => null);
    const contentType = apiRes?.headers?.get('content-type') || '';
    if (apiRes && apiRes.ok && contentType.includes('application/json')) {
      const apiBiz = await apiRes.json();
      if (apiBiz && apiBiz.id) {
        const mapped = mapBusinessRow(apiBiz);
        return mapped;
      }
    }
  } catch {}

  // 3. Fallback: Global Cloud Sync
  try {
    const cloudData = await fetchGlobalCloudData(true);
    if (cloudData && Array.isArray(cloudData.businesses)) {
      const cloudMatch = cloudData.businesses
        .map(mapBusinessRow)
        .find(
          (b) =>
            normalizeKey(b.slug) === normSlug ||
            normalizeKey(b.id) === normSlug ||
            normalizeKey(b.ownerId || '') === normSlug ||
            normalizeKey(b.name) === normSlug
        );
      if (cloudMatch) {
        return cloudMatch;
      }
    }
  } catch {}

  // 4. Fallback: Local runtime state
  const mergedLocal = mergeBusinessLists(runtimeBusinesses, readCachedBusinesses(), [...INITIAL_BIZ]);
  const localMatch = mergedLocal.find(
    (b) =>
      normalizeKey(b.slug) === normSlug ||
      normalizeKey(b.id) === normSlug ||
      normalizeKey(b.ownerId || '') === normSlug ||
      normalizeKey(b.name) === normSlug
  );
  return localMatch || null;
}

export async function getBusinessById(id: string): Promise<Business | null> {
  return getBusinessBySlug(id);
}

export function getLocalBusinesses(): Business[] {
  runtimeBusinesses = mergeBusinessLists(readCachedBusinesses(), runtimeBusinesses, [...INITIAL_BIZ]);
  return runtimeBusinesses;
}

export async function addBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business> {
  const id = `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // 1. Generate clean, valid slug using slugify
  let baseSlug = slugify(data.slug || data.name);
  if (!baseSlug) {
    baseSlug = `comercio-${Date.now().toString(36)}`;
  }

  // 2. Ensure unique slug against registered/runtime businesses
  const currentAll = mergeBusinessLists(readCachedBusinesses(), runtimeBusinesses, [...INITIAL_BIZ]);
  let uniqueSlug = baseSlug;
  let counter = 2;
  while (currentAll.some((b) => b.slug.toLowerCase() === uniqueSlug.toLowerCase() && b.id !== id)) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  // 3. Set valid ownerId / tenant_id
  const ownerId =
    data.ownerId && data.ownerId.trim()
      ? data.ownerId.trim()
      : `owner_${uniqueSlug}_${Date.now().toString(36).slice(-4)}`;

  const newBiz: Business = {
    ...data,
    id,
    slug: uniqueSlug,
    category: data.category || 'Comércio & Serviços',
    phone: data.phone || '',
    email: data.email || `${uniqueSlug}@reputaflow.com`,
    address: data.address || '',
    googleReviewUrl: data.googleReviewUrl || '',
    logoUrl: data.logoUrl || '',
    bannerUrl: data.bannerUrl || '',
    minRatingForGoogle: data.minRatingForGoogle || 4,
    qrThemeColor: data.qrThemeColor || '#4f46e5',
    activePlan: data.activePlan || 'pro',
    planId: data.planId || 'plan_pro',
    ownerId,
    currency: data.currency || 'EUR',
    status: data.status || 'active',
    password: data.password || 'reputa123',
    createdAt: now,
    updatedAt: now
  };

  // 4. Garantir explicitamente que o novo estabelecimento inicia ZERADO (0 avaliações, 0 casos de recuperação, 0 clientes)
  runtimeReviews = runtimeReviews.filter(
    (r) => !isMatchingBusiness(r.businessId, id) && !isMatchingBusiness(r.businessId, uniqueSlug)
  );
  runtimeRecoveryCases = runtimeRecoveryCases.filter(
    (c) => !isMatchingBusiness(c.businessId, id) && !isMatchingBusiness(c.businessId, uniqueSlug)
  );
  runtimeFeedback = runtimeFeedback.filter(
    (f) => !isMatchingBusiness(f.businessId, id) && !isMatchingBusiness(f.businessId, uniqueSlug)
  );
  runtimeCustomers = runtimeCustomers.filter(
    (c) => !isMatchingBusiness(c.businessId, id) && !isMatchingBusiness(c.businessId, uniqueSlug)
  );

  // IMMEDIATELY persist to localStorage and update runtime state BEFORE async calls
  // so even if the user refreshes immediately, the business NEVER disappears!
  unmarkBusinessKeyDeleted(id, uniqueSlug, newBiz.name);
  runtimeBusinesses = [
    newBiz,
    ...currentAll.filter(
      (b) =>
        b.id !== id &&
        b.slug.toLowerCase() !== uniqueSlug.toLowerCase() &&
        normalizeKey(b.name) !== normalizeKey(newBiz.name)
    )
  ];
  saveCachedBusinesses(runtimeBusinesses);
  pushGlobalCloudData({ businesses: runtimeBusinesses }).catch(() => {});
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }

  // 5. VINCULAÇÃO AUTOMÁTICA A UMA ÚNICA PLACA NUMERADA (Sem criar placas duplicadas por slug)
  const directRedirectUrl = `/r/${encodeURIComponent(uniqueSlug)}`;
  try {
    if (typeof window !== 'undefined') {
      const rawPlates = localStorage.getItem('reputaflow_nfc_plates_cache');
      const localPlates: any[] = rawPlates ? JSON.parse(rawPlates) : [];
      if (Array.isArray(localPlates)) {
        // Keep only numbered plates and check if this business already has a plate assigned
        const numberedOnly = localPlates.filter(
          (p: any) => p && p.id && /^\d+$/.test(String(p.id).replace(/^#|^QRC/i, ''))
        );
        const alreadyAssigned = numberedOnly.some(
          (p: any) =>
            p.status === 'active' &&
            (p.merchant_id === id ||
              (p.merchant_slug && p.merchant_slug.toLowerCase() === uniqueSlug.toLowerCase()))
        );

        if (!alreadyAssigned) {
          const freeIdx = numberedOnly.findIndex((p: any) => p.status !== 'active');
          if (freeIdx >= 0) {
            numberedOnly[freeIdx] = {
              ...numberedOnly[freeIdx],
              status: 'active',
              merchant_id: id,
              redirect_url: directRedirectUrl,
              merchant_name: newBiz.name,
              merchant_slug: uniqueSlug,
              merchant_logo_url: newBiz.logoUrl || undefined,
              updated_at: now
            };
          } else {
            let maxNum = 5;
            numberedOnly.forEach((p: any) => {
              const n = parseInt(String(p.id).replace(/\D/g, ''), 10);
              if (!isNaN(n) && n > maxNum) maxNum = n;
            });
            const nextId = String(maxNum + 1).padStart(3, '0');
            numberedOnly.push({
              id: nextId,
              status: 'active',
              merchant_id: id,
              redirect_url: directRedirectUrl,
              merchant_name: newBiz.name,
              merchant_slug: uniqueSlug,
              merchant_logo_url: newBiz.logoUrl || undefined,
              scan_count: 0,
              created_at: now,
              updated_at: now
            });
          }
          localStorage.setItem('reputaflow_nfc_plates_cache', JSON.stringify(numberedOnly));
        }
      }
    }
  } catch {}

  // 6. Primary persistence: Backend Server REST API (writes to PostgreSQL Cloud SQL & data/db.json)
  try {
    const apiRes = await fetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBiz)
    });
    const contentType = apiRes.headers.get('content-type') || '';
    if (apiRes.ok && contentType.includes('application/json')) {
      const savedOnServer = await apiRes.json();
      if (savedOnServer && savedOnServer.id) {
        const mappedServer = mapBusinessRow(savedOnServer);
        runtimeBusinesses = runtimeBusinesses.map((b) =>
          b.id === id ? { ...newBiz, ...mappedServer, id: newBiz.id } : b
        );
        saveCachedBusinesses(runtimeBusinesses);
      }
    }
  } catch (apiErr) {
    console.warn('[Server API /api/businesses network warning]:', apiErr);
  }

  // 7. Secondary persistence: Adaptive Supabase insert across 'businesses', 'tenants', 'establishments'
  const payload: Record<string, any> = {
    id,
    name: newBiz.name,
    slug: newBiz.slug,
    category: newBiz.category,
    address: newBiz.address || '',
    phone: newBiz.phone || '',
    email: newBiz.email || '',
    google_review_url: newBiz.googleReviewUrl || null,
    logo_url: newBiz.logoUrl || null,
    status: newBiz.status,
    plan_id: newBiz.planId,
    owner_id: newBiz.ownerId,
    currency: newBiz.currency,
    created_at: now,
    updated_at: now
  };

  try {
    const insertedBiz = await insertBusinessToSupabaseAdaptive('businesses', payload);
    if (!insertedBiz) {
      await insertBusinessToSupabaseAdaptive('tenants', payload);
      await insertBusinessToSupabaseAdaptive('establishments', payload);
    }
  } catch (err: any) {
    console.warn('[Supabase addBusiness caught]:', err);
  }

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  return newBiz;
}

export const createBusiness = addBusiness;

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const cleanId = String(id || '').trim();
  const currentAll = mergeBusinessLists(readCachedBusinesses(), runtimeBusinesses, [...INITIAL_BIZ]);
  const existing = currentAll.find(
    (b) => b.id === cleanId || (b.slug && b.slug.toLowerCase() === cleanId.toLowerCase())
  );
  const establishmentId = existing?.id || cleanId;
  const existingSlug = existing?.slug || cleanId;
  const now = new Date().toISOString();

  // PASSO 1: BLINDAGEM DO PAYLOAD DE UPDATE
  const dbUpdates: Record<string, any> = { updated_at: now };
  if (data.name !== undefined) dbUpdates.name = String(data.name).trim();
  if (data.category !== undefined) dbUpdates.category = String(data.category).trim();
  if (data.address !== undefined) dbUpdates.address = String(data.address).trim();
  if (data.phone !== undefined) dbUpdates.phone = String(data.phone).trim();
  if (data.email !== undefined) dbUpdates.email = String(data.email).trim();
  if (data.currency !== undefined) dbUpdates.currency = data.currency;
  if (data.googleReviewUrl !== undefined) dbUpdates.google_review_url = data.googleReviewUrl || null;
  if (data.logoUrl !== undefined) dbUpdates.logo_url = data.logoUrl || null;
  if (data.bannerUrl !== undefined) dbUpdates.banner_url = data.bannerUrl || null;
  if (data.planId !== undefined) dbUpdates.plan_id = data.planId;

  let cleanSlug = existingSlug;
  if (data.slug && data.slug.trim()) {
    const candidateSlug = data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (candidateSlug) {
      dbUpdates.slug = candidateSlug;
      cleanSlug = candidateSlug;
    }
  }

  const safeStatus = data.status || existing?.status || 'active';
  dbUpdates.status = safeStatus;

  delete dbUpdates.id;
  delete dbUpdates.tenant_id;
  delete dbUpdates.created_at;
  delete dbUpdates.createdAt;

  // 1. Atualização imediata em memória e em localStorage (garante persistência imediata no F5)
  runtimeBusinesses = currentAll.map((b) => {
    if (b.id === establishmentId || (b.slug && b.slug.toLowerCase() === existingSlug.toLowerCase())) {
      return {
        ...b,
        ...data,
        id: b.id,
        slug: cleanSlug || b.slug,
        ownerId: b.ownerId,
        status: safeStatus,
        createdAt: b.createdAt,
        updatedAt: now
      };
    }
    return b;
  });
  saveCachedBusinesses(runtimeBusinesses);
  pushGlobalCloudData({ businesses: runtimeBusinesses }).catch(() => {});
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }

  // 2. Persistência no Backend REST API (/api/businesses/:id, com fallback POST /api/businesses se 404)
  try {
    const updatedRecord = runtimeBusinesses.find((b) => b.id === establishmentId);
    const putRes = await fetch(`/api/businesses/${encodeURIComponent(establishmentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        id: establishmentId,
        status: safeStatus,
        updatedAt: now
      })
    });
    if (putRes.status === 404 && updatedRecord) {
      await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      });
    }
  } catch (apiErr) {
    console.warn('[updateBusiness API sync warning]:', apiErr);
  }

  // 3. Persistência no Supabase com remoção adaptativa de colunas inexistentes
  try {
    let supaUpdates = { ...dbUpdates };
    for (let attempt = 0; attempt < 6; attempt++) {
      const { error: bizErr } = await supabase
        .from('businesses')
        .update(supaUpdates)
        .eq('id', establishmentId);

      if (!bizErr) break;
      const colMatch =
        bizErr.message?.match(/Could not find the '([^']+)' column/i) ||
        bizErr.message?.match(/column "([^"]+)" of relation/i);
      if (colMatch && colMatch[1] && colMatch[1] in supaUpdates) {
        delete supaUpdates[colMatch[1]];
        continue;
      }
      await supabase.from('businesses').update(supaUpdates).eq('slug', existingSlug);
      break;
    }

    try {
      await supabase.from('tenants').update(supaUpdates).or(`id.eq.${establishmentId},slug.eq.${existingSlug}`);
    } catch (_) {}
    try {
      await supabase.from('establishments').update(supaUpdates).or(`id.eq.${establishmentId},slug.eq.${existingSlug}`);
    } catch (_) {}
  } catch (err) {
    console.error('[Supabase updateBusiness catch]:', err);
  }
}

export const updateEstablishment = updateBusiness;

export async function deleteBusiness(id: string): Promise<void> {
  const cleanId = String(id || '').trim();
  const currentAll = mergeBusinessLists(readCachedBusinesses(), runtimeBusinesses);
  const target = currentAll.find(
    (b) => b.id === cleanId || b.slug.toLowerCase() === cleanId.toLowerCase()
  );
  const targetSlug = target?.slug ? target.slug.toLowerCase().trim() : '';
  const targetName = target?.name ? target.name.trim() : '';
  const targetNameKey = normalizeKey(targetName);

  // 1. Mark ID, slug, and normalized name as permanently deleted
  markBusinessKeyDeleted(cleanId);
  if (targetSlug) markBusinessKeyDeleted(targetSlug);
  if (targetName) markBusinessKeyDeleted(targetName);

  // 2. Remove from runtime and localStorage cache
  runtimeBusinesses = currentAll.filter(
    (b) =>
      b.id !== cleanId &&
      (!targetSlug || b.slug.toLowerCase() !== targetSlug) &&
      (!targetNameKey || normalizeKey(b.name) !== targetNameKey)
  );
  saveCachedBusinesses(runtimeBusinesses);

  // 3. Unlink any QR/NFC plate pointing to the deleted business in localStorage
  let updatedPlates: any[] | undefined = undefined;
  try {
    if (typeof window !== 'undefined') {
      const rawPlates = localStorage.getItem('reputaflow_nfc_plates_cache');
      const localPlates: any[] = rawPlates ? JSON.parse(rawPlates) : [];
      if (Array.isArray(localPlates)) {
        updatedPlates = localPlates.map((p: any) => {
          if (!p) return p;
          const pMid = String(p.merchant_id || '').trim();
          const pSlug = String(p.merchant_slug || '').toLowerCase().trim();
          const pNameKey = normalizeKey(p.merchant_name || '');
          if (
            pMid === cleanId ||
            (targetSlug && pSlug === targetSlug) ||
            (targetNameKey && pNameKey === targetNameKey)
          ) {
            return {
              ...p,
              status: 'inactive',
              merchant_id: null,
              redirect_url: null,
              merchant_name: undefined,
              merchant_slug: undefined,
              merchant_logo_url: undefined,
              updated_at: new Date().toISOString()
            };
          }
          return p;
        });
        localStorage.setItem('reputaflow_nfc_plates_cache', JSON.stringify(updatedPlates));
      }
    }
  } catch {}

  // 4. Push permanent deletion to CloudSync
  pushGlobalCloudData({
    businesses: runtimeBusinesses,
    nfcPlates: updatedPlates,
    deletedBusinessIds: Array.from(readDeletedBusinessKeys())
  }).catch(() => {});

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
    window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
  }

  // 5. Delete from Backend Server REST API (PostgreSQL & data/db.json)
  try {
    await fetch(`/api/businesses/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
    if (targetSlug && targetSlug !== cleanId.toLowerCase()) {
      await fetch(`/api/businesses/${encodeURIComponent(targetSlug)}`, { method: 'DELETE' });
    }
  } catch (apiErr) {
    console.warn('[deleteBusiness API warning]:', apiErr);
  }

  // 6. Delete from Supabase across all business & plate tables
  for (const tbl of ['businesses', 'tenants', 'establishments']) {
    try {
      await supabase.from(tbl).delete().eq('id', cleanId);
      if (targetSlug) {
        await supabase.from(tbl).delete().eq('slug', targetSlug);
      }
      if (targetName) {
        await supabase.from(tbl).delete().eq('name', targetName);
      }
    } catch {}
  }

  try {
    await supabase
      .from('nfc_plates')
      .update({ status: 'inactive', merchant_id: null, redirect_url: null })
      .eq('merchant_id', cleanId);
    await supabase
      .from('qr_plates')
      .update({ status: 'inactive', tenant_id: null, redirect_url: null })
      .eq('tenant_id', cleanId);
  } catch {}
}

// ==========================================
// REVIEWS SERVICE (SUPABASE ONLY)
// ==========================================
function mapReviewRow(row: any): Review {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || row.merchant_id || ''),
    customerId: row.customer_id || row.customerId || undefined,
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerEmail: row.customer_email || row.customerEmail || '',
    rating: Number(row.rating || 5),
    channel: (row.channel as any) || 'qr',
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  let isSubscribed = true;

  const fetchReviews = async () => {
    try {
      // 1. PRIMARY SINGLE SOURCE OF TRUTH: SUPABASE
      let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        const mapped = data.map(mapReviewRow);
        if (!businessId) {
          runtimeReviews = mapped;
        } else {
          const others = runtimeReviews.filter((r) => !isMatchingBusiness(r.businessId, businessId));
          runtimeReviews = [...mapped, ...others];
        }
        if (isSubscribed) {
          callback(mapped);
        }
        return;
      }

      // 2. Fallback: Server API (/api/reviews)
      const url = '/api/reviews' + (businessId ? `?businessId=${encodeURIComponent(businessId)}` : '');
      const apiRes = await fetch(url, { cache: 'no-store' }).catch(() => null);
      const contentType = apiRes?.headers?.get('content-type') || '';
      if (apiRes && apiRes.ok && contentType.includes('application/json')) {
        const apiData = await apiRes.json();
        if (Array.isArray(apiData)) {
          const mapped = apiData.map(mapReviewRow);
          if (!businessId) {
            runtimeReviews = mapped;
          } else {
            const others = runtimeReviews.filter((r) => !isMatchingBusiness(r.businessId, businessId));
            runtimeReviews = [...mapped, ...others];
          }
          if (isSubscribed) {
            const filtered = businessId
              ? mapped.filter((r) => isMatchingBusiness(r.businessId, businessId))
              : runtimeReviews;
            callback(filtered);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('[subscribeReviews notice]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId
        ? runtimeReviews.filter((r) => isMatchingBusiness(r.businessId, businessId))
        : runtimeReviews;
      callback(filtered);
    }
  };

  fetchReviews();

  const unsubscribeRealtime = createSafeTableSubscription('reviews', fetchReviews);
  const interval = setInterval(fetchReviews, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

export async function addReview(data: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
  const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newReview: Review = {
    ...data,
    id,
    createdAt: now
  };

  // 1. Primary persistence: Server API (/api/reviews) -> Cloud SQL & data/db.json
  try {
    await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReview)
    });
  } catch (apiErr) {
    console.warn('[Server API /api/reviews catch]:', apiErr);
  }

  // 2. Secondary persistence: Supabase
  try {
    const { error } = await supabase.from('reviews').insert([
      {
        id,
        business_id: newReview.businessId,
        customer_name: newReview.customerName || null,
        customer_phone: newReview.customerPhone || null,
        customer_email: newReview.customerEmail || null,
        rating: newReview.rating,
        channel: newReview.channel,
        created_at: now
      }
    ]);
    if (error) {
      console.warn('[Supabase addReview warning]:', error.message);
    }
  } catch (err) {
    console.warn('[Supabase addReview catch]:', err);
  }

  // Auto upsert customer in CRM
  if (newReview.customerName || newReview.customerPhone || newReview.customerEmail) {
    try {
      await upsertCustomerFromReview(newReview);
    } catch {}
  }

  runtimeReviews = [newReview, ...runtimeReviews.filter((r) => r.id !== id)];
  notifyDataChanged();
  return newReview;
}

export const submitReview = async (data: any): Promise<Review & { reviewId: string }> => {
  const rev = await addReview(data);
  return { ...rev, reviewId: rev.id };
};

export async function deleteReview(reviewId: string): Promise<void> {
  try {
    await supabase.from('reviews').delete().eq('id', reviewId);
  } catch (err) {
    console.error('[Supabase deleteReview error]:', err);
  }

  runtimeReviews = runtimeReviews.filter((r) => r.id !== reviewId);
  notifyDataChanged();
}

export async function clearAllReviews(businessId?: string): Promise<void> {
  try {
    if (businessId) {
      await supabase.from('reviews').delete().eq('business_id', businessId);
    } else {
      await supabase.from('reviews').delete().neq('id', '');
    }
  } catch (err) {
    console.error('[Supabase clearAllReviews error]:', err);
  }

  runtimeReviews = businessId ? runtimeReviews.filter((r) => !isMatchingBusiness(r.businessId, businessId)) : [];
  notifyDataChanged();
}

// ==========================================
// FEEDBACK & RECOVERY CASES SERVICE (SUPABASE ONLY)
// ==========================================
function mapFeedbackRow(row: any): Feedback {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || ''),
    reviewId: String(row.review_id || row.reviewId || ''),
    customerId: row.customer_id || row.customerId || undefined,
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerEmail: row.customer_email || row.customerEmail || '',
    rating: Number(row.rating || 1),
    question1: row.question1 || '',
    question2: row.question2 || '',
    question3WantsContact: Boolean(row.question3_wants_contact ?? row.question3WantsContact ?? true),
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  let isSubscribed = true;

  const fetchFeedback = async () => {
    try {
      let query = supabase.from('feedback').select('*').order('created_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        const mapped = data.map(mapFeedbackRow);
        if (mapped.length > 0) {
          const existingIds = new Set(mapped.map((f) => f.id));
          runtimeFeedback = [...mapped, ...runtimeFeedback.filter((f) => !existingIds.has(f.id))];
        }
        if (isSubscribed) {
          const filtered = businessId
            ? runtimeFeedback.filter((f) => isMatchingBusiness(f.businessId, businessId))
            : runtimeFeedback;
          callback(filtered);
        }
        return;
      }
    } catch (err) {
      console.warn('[Supabase subscribeFeedback error]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId
        ? runtimeFeedback.filter((f) => isMatchingBusiness(f.businessId, businessId))
        : runtimeFeedback;
      callback(filtered);
    }
  };

  fetchFeedback();

  const unsubscribeRealtime = createSafeTableSubscription('feedback', fetchFeedback);
  const interval = setInterval(fetchFeedback, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

function mapRecoveryRow(row: any): RecoveryCase {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || ''),
    customerId: row.customer_id || row.customerId || undefined,
    reviewId: String(row.review_id || row.reviewId || ''),
    feedbackId: row.feedback_id || row.feedbackId || '',
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerEmail: row.customer_email || row.customerEmail || '',
    rating: Number(row.rating || 1),
    status: (row.status as RecoveryCaseStatus) || 'novo',
    notes: row.notes || '',
    assignedTo: row.assigned_to || row.assignedTo || '',
    resolvedAt: row.resolved_at || row.resolvedAt || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  let isSubscribed = true;

  const fetchCases = async () => {
    try {
      // 1. PRIMARY SINGLE SOURCE OF TRUTH: SUPABASE
      let query = supabase.from('recovery_cases').select('*').order('created_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        const mapped = data.map(mapRecoveryRow);
        if (!businessId) {
          runtimeRecoveryCases = mapped;
        } else {
          const others = runtimeRecoveryCases.filter((c) => !isMatchingBusiness(c.businessId, businessId));
          runtimeRecoveryCases = [...mapped, ...others];
        }
        if (isSubscribed) {
          callback(mapped);
        }
        return;
      }

      // 2. Fallback: Server API (/api/recovery-cases)
      const url = '/api/recovery-cases' + (businessId ? `?businessId=${encodeURIComponent(businessId)}` : '');
      const apiRes = await fetch(url, { cache: 'no-store' }).catch(() => null);
      const contentType = apiRes?.headers?.get('content-type') || '';
      if (apiRes && apiRes.ok && contentType.includes('application/json')) {
        const apiData = await apiRes.json();
        if (Array.isArray(apiData)) {
          const mapped = apiData.map(mapRecoveryRow);
          if (!businessId) {
            runtimeRecoveryCases = mapped;
          } else {
            const others = runtimeRecoveryCases.filter((c) => !isMatchingBusiness(c.businessId, businessId));
            runtimeRecoveryCases = [...mapped, ...others];
          }
          if (isSubscribed) {
            const filtered = businessId
              ? mapped.filter((c) => isMatchingBusiness(c.businessId, businessId))
              : runtimeRecoveryCases;
            callback(filtered);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('[subscribeRecoveryCases notice]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId
        ? runtimeRecoveryCases.filter((c) => isMatchingBusiness(c.businessId, businessId))
        : runtimeRecoveryCases;
      callback(filtered);
    }
  };

  fetchCases();

  const unsubscribeRealtime = createSafeTableSubscription('recovery_cases', fetchCases);
  const interval = setInterval(fetchCases, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

export async function addFeedbackAndCreateRecoveryCase(
  feedbackData: Omit<Feedback, 'id' | 'createdAt'>,
  reviewId: string
): Promise<{ feedback: Feedback; recoveryCase: RecoveryCase }> {
  const fbId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const caseId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const feedback: Feedback = {
    ...feedbackData,
    id: fbId,
    reviewId,
    createdAt: now
  };

  const recoveryCase: RecoveryCase = {
    id: caseId,
    businessId: feedbackData.businessId,
    customerId: feedbackData.customerId,
    reviewId,
    feedbackId: fbId,
    customerName: feedbackData.customerName || 'Cliente Anónimo',
    customerPhone: feedbackData.customerPhone || '',
    customerEmail: feedbackData.customerEmail || '',
    rating: feedbackData.rating,
    status: 'novo',
    notes: feedbackData.question1 || feedbackData.question2
      ? `Motivo: ${feedbackData.question1 || 'Não informado'}. Melhorias: ${feedbackData.question2 || 'Não informado'}`
      : 'Avaliação insatisfatória (1-3 estrelas) recebida via QR Code.',
    createdAt: now,
    updatedAt: now
  };

  // 1. Primary persistence: Backend Server REST API (/api/recovery-cases and /api/feedback)
  try {
    await Promise.all([
      fetch('/api/recovery-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recoveryCase)
      }).catch((e) => console.warn('[Server API /api/recovery-cases error]:', e)),
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback)
      }).catch((e) => console.warn('[Server API /api/feedback error]:', e))
    ]);
  } catch (apiErr) {
    console.warn('[Server API recovery/feedback warning]:', apiErr);
  }

  // 2. Secondary persistence: Supabase
  try {
    await Promise.all([
      supabase.from('feedback').insert([
        {
          id: fbId,
          business_id: feedback.businessId,
          review_id: reviewId,
          customer_name: feedback.customerName,
          customer_phone: feedback.customerPhone,
          customer_email: feedback.customerEmail || null,
          rating: feedback.rating,
          question1: feedback.question1,
          question2: feedback.question2,
          question3_wants_contact: feedback.question3WantsContact,
          created_at: now
        }
      ]),
      supabase.from('recovery_cases').insert([
        {
          id: caseId,
          business_id: recoveryCase.businessId,
          review_id: reviewId,
          feedback_id: fbId,
          customer_name: recoveryCase.customerName,
          customer_phone: recoveryCase.customerPhone,
          customer_email: recoveryCase.customerEmail || null,
          rating: recoveryCase.rating,
          status: recoveryCase.status,
          notes: recoveryCase.notes,
          created_at: now,
          updated_at: now
        }
      ])
    ]);
  } catch (err) {
    console.warn('[Supabase addFeedbackAndCreateRecoveryCase warning]:', err);
    // Also try alternate table names if Supabase schema has differences
    try {
      await supabase.from('feedback_cases').insert([{
        id: caseId,
        business_id: recoveryCase.businessId,
        customer_name: recoveryCase.customerName,
        customer_phone: recoveryCase.customerPhone,
        rating: recoveryCase.rating,
        status: recoveryCase.status,
        notes: recoveryCase.notes,
        created_at: now
      }]);
    } catch {}
  }

  // Auto upsert customer
  try {
    await upsertCustomerFromReview({
      id: reviewId,
      businessId: feedbackData.businessId,
      customerName: feedbackData.customerName,
      customerPhone: feedbackData.customerPhone,
      customerEmail: feedbackData.customerEmail,
      rating: feedbackData.rating,
      channel: 'qr',
      createdAt: now
    });
  } catch {}

  runtimeFeedback = [feedback, ...runtimeFeedback.filter((f) => f.id !== fbId)];
  runtimeRecoveryCases = [recoveryCase, ...runtimeRecoveryCases.filter((c) => c.id !== caseId)];
  notifyDataChanged();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_recovery_case_created', { detail: recoveryCase }));
  }

  return { feedback, recoveryCase };
}

export const submitFeedbackAndRecovery = async (
  data: any,
  reviewId?: string
): Promise<{ feedback: Feedback; recoveryCase: RecoveryCase }> => {
  return await addFeedbackAndCreateRecoveryCase(data, data.reviewId || reviewId || '');
};

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  const now = new Date().toISOString();
  const updates: any = { status, updated_at: now };
  if (notes !== undefined) updates.notes = notes;
  if (status === 'resolvido' || status === 'cliente_recuperado') {
    updates.resolved_at = now;
  }

  try {
    await supabase.from('recovery_cases').update(updates).eq('id', caseId);
  } catch (err) {
    console.error('[Supabase updateRecoveryCaseStatus error]:', err);
  }

  if (customerId) {
    const custStatus = status === 'cliente_recuperado' ? 'recovered' : status === 'resolvido' ? 'active' : 'in_recovery';
    try {
      await supabase.from('customers').update({ status: custStatus, updated_at: now }).eq('id', customerId);
    } catch {}
  }

  runtimeRecoveryCases = runtimeRecoveryCases.map((c) => (c.id === caseId ? { ...c, status, notes: notes ?? c.notes, updatedAt: now } : c));
  notifyDataChanged();
}

// ==========================================
// CUSTOMERS CRM SERVICE (SUPABASE ONLY)
// ==========================================
function mapCustomerRow(row: any): Customer {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || ''),
    name: row.name || 'Cliente',
    phone: row.phone || '',
    email: row.email || '',
    reviewsCount: Number(row.reviews_count ?? row.reviewsCount ?? 1),
    lastReviewAt: row.last_review_at || row.lastReviewAt || new Date().toISOString(),
    avgRating: Number(row.avg_rating ?? row.avgRating ?? 5),
    status: (row.status as any) || 'active',
    internalNotes: row.internal_notes || row.internalNotes || '',
    lastInteractionAt: row.last_interaction_at || row.lastInteractionAt || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  let isSubscribed = true;

  const fetchCustomers = async () => {
    try {
      // 1. PRIMARY SINGLE SOURCE OF TRUTH: SUPABASE
      let query = supabase.from('customers').select('*').order('last_review_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        const mapped = data.map(mapCustomerRow);
        if (!businessId) {
          runtimeCustomers = mapped;
        } else {
          const others = runtimeCustomers.filter((c) => !isMatchingBusiness(c.businessId, businessId));
          runtimeCustomers = [...mapped, ...others];
        }
        if (isSubscribed) {
          callback(mapped);
        }
        return;
      }

      // 2. Fallback: Server API (/api/customers)
      const url = '/api/customers' + (businessId ? `?businessId=${encodeURIComponent(businessId)}` : '');
      const apiRes = await fetch(url, { cache: 'no-store' }).catch(() => null);
      const contentType = apiRes?.headers?.get('content-type') || '';
      if (apiRes && apiRes.ok && contentType.includes('application/json')) {
        const apiData = await apiRes.json();
        if (Array.isArray(apiData)) {
          const mapped = apiData.map(mapCustomerRow);
          if (!businessId) {
            runtimeCustomers = mapped;
          } else {
            const others = runtimeCustomers.filter((c) => !isMatchingBusiness(c.businessId, businessId));
            runtimeCustomers = [...mapped, ...others];
          }
          if (isSubscribed) {
            const filtered = businessId
              ? mapped.filter((c) => isMatchingBusiness(c.businessId, businessId))
              : runtimeCustomers;
            callback(filtered);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('[subscribeCustomers notice]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId
        ? runtimeCustomers.filter((c) => isMatchingBusiness(c.businessId, businessId))
        : runtimeCustomers;
      callback(filtered);
    }
  };

  fetchCustomers();

  const unsubscribeRealtime = createSafeTableSubscription('customers', fetchCustomers);
  const interval = setInterval(fetchCustomers, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

export async function upsertCustomerFromReview(review: Review): Promise<Customer> {
  const cleanPhone = (review.customerPhone || '').trim();
  const cleanEmail = (review.customerEmail || '').trim().toLowerCase();
  const cleanName = (review.customerName || 'Cliente').trim();
  const now = new Date().toISOString();

  let existing: Customer | null = null;

  try {
    let q = supabase.from('customers').select('*').eq('business_id', review.businessId);
    if (cleanPhone) {
      q = q.eq('phone', cleanPhone);
    } else if (cleanEmail) {
      q = q.eq('email', cleanEmail);
    }
    const { data } = await q;
    if (data && data.length > 0) {
      existing = mapCustomerRow(data[0]);
    }
  } catch {}

  if (existing) {
    const newCount = existing.reviewsCount + 1;
    const newAvg = Number(((existing.avgRating * existing.reviewsCount + review.rating) / newCount).toFixed(1));
    const nextStatus = review.rating <= 3 ? 'in_recovery' : existing.status === 'in_recovery' ? 'recovered' : 'active';

    const updatedCust: Customer = {
      ...existing,
      name: cleanName || existing.name,
      phone: cleanPhone || existing.phone,
      email: cleanEmail || existing.email,
      reviewsCount: newCount,
      avgRating: newAvg,
      lastReviewAt: now,
      status: nextStatus,
      updatedAt: now
    };

    try {
      await supabase.from('customers').update({
        name: updatedCust.name,
        phone: updatedCust.phone,
        email: updatedCust.email || null,
        reviews_count: newCount,
        avg_rating: newAvg,
        last_review_at: now,
        status: nextStatus,
        updated_at: now
      }).eq('id', existing.id);
    } catch {}

    runtimeCustomers = runtimeCustomers.map((c) => (c.id === existing?.id ? updatedCust : c));
    notifyDataChanged();
    return updatedCust;
  } else {
    const custId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const newCust: Customer = {
      id: custId,
      businessId: review.businessId,
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      reviewsCount: 1,
      avgRating: review.rating,
      lastReviewAt: now,
      status: review.rating <= 3 ? 'in_recovery' : 'active',
      createdAt: now,
      updatedAt: now
    };

    try {
      await supabase.from('customers').insert([
        {
          id: custId,
          business_id: newCust.businessId,
          name: newCust.name,
          phone: newCust.phone || '',
          email: newCust.email || null,
          reviews_count: 1,
          avg_rating: review.rating,
          last_review_at: now,
          status: newCust.status,
          created_at: now,
          updated_at: now
        }
      ]);
    } catch {}

    runtimeCustomers = [newCust, ...runtimeCustomers];
    notifyDataChanged();
    return newCust;
  }
}

export async function addCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
  const custId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const newCust: Customer = {
    ...data,
    id: custId,
    createdAt: now,
    updatedAt: now
  };

  try {
    await supabase.from('customers').insert([
      {
        id: custId,
        business_id: newCust.businessId,
        name: newCust.name,
        phone: newCust.phone || '',
        email: newCust.email || null,
        reviews_count: newCust.reviewsCount,
        avg_rating: newCust.avgRating,
        last_review_at: newCust.lastReviewAt,
        status: newCust.status,
        internal_notes: newCust.internalNotes || null,
        created_at: now,
        updated_at: now
      }
    ]);
  } catch (err) {
    console.error('[Supabase addCustomer error]:', err);
  }

  runtimeCustomers = [newCust, ...runtimeCustomers];
  notifyDataChanged();
  return newCust;
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  const now = new Date().toISOString();
  const dbUpdates: any = { updated_at: now };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.internalNotes !== undefined) dbUpdates.internal_notes = updates.internalNotes;

  try {
    await supabase.from('customers').update(dbUpdates).eq('id', id);
  } catch (err) {
    console.error('[Supabase updateCustomer error]:', err);
  }

  runtimeCustomers = runtimeCustomers.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: now } : c));
  notifyDataChanged();
}

export async function deleteCustomer(id: string): Promise<void> {
  try {
    await supabase.from('customers').delete().eq('id', id);
  } catch (err) {
    console.error('[Supabase deleteCustomer error]:', err);
  }

  runtimeCustomers = runtimeCustomers.filter((c) => c.id !== id);
  notifyDataChanged();
}

// ==========================================
// INTERACTIONS SERVICE
// ==========================================
export function subscribeInteractions(businessId: string | null, callback: (list: Interaction[]) => void) {
  let isSubscribed = true;

  const fetchInteractions = async () => {
    if (isSubscribed) callback([]);
  };

  fetchInteractions();
  return () => {
    isSubscribed = false;
  };
}

export async function addInteraction(data: Omit<Interaction, 'id' | 'createdAt'>): Promise<Interaction> {
  const id = `int_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  return { ...data, id, createdAt: now };
}

// ==========================================
// PLANS & PLATFORM SETTINGS
// ==========================================
export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    price: 99,
    currency: 'EUR',
    maxBusinesses: 1,
    maxReviewsMonth: 200,
    features: ['QR Code Inteligente', 'Página Pública de Avaliação', 'Proteção Básica de Reputação'],
    isActive: true
  },
  {
    id: 'plan_pro',
    name: 'Profissional',
    price: 199,
    currency: 'EUR',
    maxBusinesses: 3,
    maxReviewsMonth: 1000,
    features: ['QR Code Personalizado', 'CRM de Recuperação Ativa', 'Gestão Multi-moeda (EUR / BRL)', 'Exportação de Relatórios'],
    isActive: true
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    price: 399,
    currency: 'EUR',
    maxBusinesses: 10,
    maxReviewsMonth: 5000,
    features: ['Todas as funcionalidades Pro', 'Suporte Prioritário 24/7', 'Acesso Multi-utilizador / Equipa'],
    isActive: true
  }
];

export async function getPlans(): Promise<Plan[]> {
  return DEFAULT_PLANS;
}

export async function savePlan(_plan: Plan): Promise<void> {}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  id: 'default',
  platformName: 'ReputaFlow',
  supportEmail: 'suporte@reputaflow.com',
  defaultGoogleReviewInstructions:
    'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes na comunidade.',
  allowPublicRegistration: false
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return DEFAULT_PLATFORM_SETTINGS;
}

export async function savePlatformSettings(_settings: Partial<PlatformSettings>): Promise<void> {}
