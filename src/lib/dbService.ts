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
import { supabase, isSupabaseConfigured, uploadBusinessLogo } from './supabase.ts';

// Clean initial data - completely empty ready for real onboarding
export const REGISTERED_BUSINESSES: Business[] = [];

const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_businesses';
const LOCAL_STORAGE_KEY_REVIEWS = 'reputaflow_reviews_cache';
const LOCAL_STORAGE_KEY_FEEDBACK = 'reputaflow_feedback_cache';
const LOCAL_STORAGE_KEY_CASES = 'reputaflow_cases_cache';
const LOCAL_STORAGE_KEY_CUSTOMERS = 'reputaflow_customers_cache';
const LOCAL_STORAGE_KEY_PLANS = 'reputaflow_plans_cache';
const LOCAL_STORAGE_KEY_SETTINGS = 'reputaflow_settings_cache';

// Clean up any legacy demo mock cache once on startup
if (typeof window !== 'undefined') {
  try {
    const rawBiz = localStorage.getItem(LOCAL_STORAGE_KEY_BIZ);
    if (rawBiz && (rawBiz.includes('biz_mrnavalha') || rawBiz.includes('Mr. Navalha Barbearia'))) {
      localStorage.removeItem(LOCAL_STORAGE_KEY_BIZ);
      localStorage.removeItem(LOCAL_STORAGE_KEY_REVIEWS);
      localStorage.removeItem(LOCAL_STORAGE_KEY_FEEDBACK);
      localStorage.removeItem(LOCAL_STORAGE_KEY_CASES);
      localStorage.removeItem(LOCAL_STORAGE_KEY_CUSTOMERS);
    }
  } catch {}
}

// Shared API fetch helper
async function apiFetch(url: string, options?: RequestInit) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.warn(`[apiFetch] Network error reaching ${url}:`, err);
    return new Response(JSON.stringify({ error: 'Network error' }), { status: 503 });
  }
}

// ==========================================
// IMAGE UPLOAD SERVICE (SUPABASE STORAGE + RESILIENT FALLBACK)
// ==========================================
export async function uploadImage(file: File, businessId?: string): Promise<string> {
  const currentMerchantId = businessId || 'biz';
  const publicUrl = await uploadBusinessLogo(file, currentMerchantId);

  try {
    const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
    const updated = list.map((b) => (b.id === currentMerchantId ? { ...b, logoUrl: publicUrl } : b));
    setCached(LOCAL_STORAGE_KEY_BIZ, updated);
  } catch {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }

  return publicUrl;
}

// ==========================================
// STRING NORMALIZATION UTILS
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

// ==========================================
// LOCAL STORAGE CACHE HELPERS
// ==========================================
function getCached<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function setCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_live_sync'));
  }
}

// ==========================================
// BUSINESSES
// ==========================================
export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  const fetchAll = async () => {
    // 1. Supabase First
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          const mapped: Business[] = data.map((b: any) => ({
            id: b.id,
            name: b.name || '',
            slug: b.slug || '',
            category: b.category || 'Comércio & Serviços',
            address: b.address || '',
            phone: b.phone || '',
            email: b.email || '',
            googleReviewUrl: b.google_review_url || b.googleReviewUrl || '',
            logoUrl: b.logo_url || b.logoUrl || '',
            bannerUrl: b.banner_url || b.bannerUrl || '',
            minRatingForGoogle: b.min_rating_for_google || b.minRatingForGoogle || 4,
            qrThemeColor: b.qr_theme_color || b.qrThemeColor || '#4f46e5',
            activePlan: (b.active_plan || b.activePlan || b.plan_id || 'pro') as any,
            planId: b.plan_id || b.planId || 'plan_pro',
            ownerId: b.owner_id || b.ownerId || '',
            currency: b.currency || 'EUR',
            status: b.status || 'active',
            password: b.password || '',
            createdAt: b.created_at || b.createdAt || new Date().toISOString(),
            updatedAt: b.updated_at || b.updatedAt || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_BIZ, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {
        console.warn('[subscribeBusinesses] Supabase query warning:', e);
      }
    }

    // 2. Server API Fallback
    try {
      const res = await apiFetch('/api/businesses');
      if (res.ok) {
        const data: any[] = await res.json();
        if (Array.isArray(data)) {
          const mapped: Business[] = data.map((b: any) => ({
            id: b.id,
            name: b.name || '',
            slug: b.slug || '',
            category: b.category || '',
            address: b.address || '',
            phone: b.phone || '',
            email: b.email || '',
            googleReviewUrl: b.googleReviewUrl || b.google_review_url || '',
            logoUrl: b.logoUrl || b.logo_url || '',
            bannerUrl: b.bannerUrl || b.banner_url || '',
            minRatingForGoogle: b.minRatingForGoogle || 4,
            qrThemeColor: b.qrThemeColor || '#4f46e5',
            activePlan: b.activePlan || 'pro',
            planId: b.planId || 'plan_pro',
            ownerId: b.ownerId || '',
            currency: b.currency || 'EUR',
            status: b.status || 'active',
            password: b.password || '',
            createdAt: b.createdAt || new Date().toISOString(),
            updatedAt: b.updatedAt || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_BIZ, mapped);
          callback(mapped);
          return;
        }
      }
    } catch (e) {}

    // 3. Cached fallback
    callback(getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []));
  };

  fetchAll();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    try {
      channel = supabase
        .channel('businesses_realtime_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
          fetchAll();
        })
        .subscribe();
    } catch (e) {
      console.warn('[Supabase Realtime] Channel subscribe warning:', e);
    }
  }

  const handleCustomEvent = () => fetchAll();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_businesses_updated', handleCustomEvent);
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  const interval = setInterval(fetchAll, 5000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_businesses_updated', handleCustomEvent);
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
    clearInterval(interval);
  };
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const clean = slug ? slug.trim() : '';
  const normSlug = normalizeKey(clean);
  if (!normSlug) return null;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .or(`slug.eq.${clean},slug.eq.${normSlug},id.eq.${clean}`);

      if (!error && data && data.length > 0) {
        const b = data[0];
        return {
          id: b.id,
          name: b.name || '',
          slug: b.slug || '',
          category: b.category || '',
          address: b.address || '',
          phone: b.phone || '',
          email: b.email || '',
          googleReviewUrl: b.google_review_url || b.googleReviewUrl || '',
          logoUrl: b.logo_url || b.logoUrl || '',
          bannerUrl: b.banner_url || b.bannerUrl || '',
          minRatingForGoogle: b.min_rating_for_google || 4,
          qrThemeColor: b.qr_theme_color || '#4f46e5',
          activePlan: (b.active_plan || 'pro') as any,
          planId: b.plan_id || 'plan_pro',
          ownerId: b.owner_id || '',
          currency: b.currency || 'EUR',
          status: b.status || 'active',
          password: b.password || '',
          createdAt: b.created_at || new Date().toISOString(),
          updatedAt: b.updated_at || new Date().toISOString()
        };
      }
    } catch (e) {}
  }

  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(clean)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  const cached = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  return (
    cached.find(
      (b) =>
        normalizeKey(b.slug) === normSlug ||
        normalizeKey(b.id) === normSlug ||
        normalizeKey(b.name) === normSlug
    ) || null
  );
}

export async function getBusinessById(id: string): Promise<Business | null> {
  return getBusinessBySlug(id);
}

export function getLocalBusinesses(): Business[] {
  return getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
}

export async function addBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business> {
  const id = `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const slug = data.slug ? data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-') : normalizeKey(data.name);

  const newBiz: Business = {
    ...data,
    id,
    slug,
    createdAt: now,
    updatedAt: now
  };

  const supabaseRecord = {
    id,
    name: data.name,
    slug,
    category: data.category || 'Comércio & Serviços',
    address: data.address || '',
    phone: data.phone || '',
    email: data.email || '',
    google_review_url: data.googleReviewUrl || null,
    logo_url: data.logoUrl || null,
    banner_url: data.bannerUrl || null,
    min_rating_for_google: data.minRatingForGoogle || 4,
    qr_theme_color: data.qrThemeColor || '#4f46e5',
    active_plan: data.activePlan || 'pro',
    plan_id: data.planId || 'plan_pro',
    owner_id: data.ownerId || 'admin-created',
    currency: data.currency || 'EUR',
    status: data.status || 'active',
    password: data.password || 'senha123',
    created_at: now,
    updated_at: now
  };

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('businesses').insert([supabaseRecord]);
      if (error) console.warn('[Supabase businesses insert warning]:', error);
    } catch (e) {
      console.warn('[Supabase businesses insert catch]:', e);
    }
  }

  try {
    await apiFetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...supabaseRecord,
        googleReviewUrl: data.googleReviewUrl,
        logoUrl: data.logoUrl,
        planId: data.planId
      })
    });
  } catch (err) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  setCached(LOCAL_STORAGE_KEY_BIZ, [newBiz, ...list]);
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }

  return newBiz;
}

export const createBusiness = addBusiness;

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const now = new Date().toISOString();
  const dbUpdates: any = { updated_at: now };
  if (data.name !== undefined) dbUpdates.name = data.name;
  if (data.slug !== undefined) dbUpdates.slug = data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
  if (data.category !== undefined) dbUpdates.category = data.category;
  if (data.address !== undefined) dbUpdates.address = data.address;
  if (data.phone !== undefined) dbUpdates.phone = data.phone;
  if (data.email !== undefined) dbUpdates.email = data.email;
  if (data.status !== undefined) dbUpdates.status = data.status;
  if (data.currency !== undefined) dbUpdates.currency = data.currency;
  if (data.password !== undefined) dbUpdates.password = data.password;
  if (data.googleReviewUrl !== undefined) {
    dbUpdates.google_review_url = data.googleReviewUrl;
    dbUpdates.googleReviewUrl = data.googleReviewUrl;
  }
  if (data.logoUrl !== undefined) {
    dbUpdates.logo_url = data.logoUrl;
    dbUpdates.logoUrl = data.logoUrl;
  }
  if (data.planId !== undefined) {
    dbUpdates.plan_id = data.planId;
    dbUpdates.planId = data.planId;
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('businesses').update(dbUpdates).eq('id', id);
      if (error) console.warn('[Supabase businesses update warning]:', error);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbUpdates)
    });
  } catch (err) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  const updatedList = list.map((b) => (b.id === id ? { ...b, ...data, updatedAt: now } : b));
  setCached(LOCAL_STORAGE_KEY_BIZ, updatedList);
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('businesses').delete().eq('id', id);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  setCached(LOCAL_STORAGE_KEY_BIZ, list.filter((b) => b.id !== id));
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }
}

// ==========================================
// REVIEWS (SUPABASE + REALTIME SYNC)
// ==========================================
export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const fetchAllSources = async () => {
    const reviewMap = new Map<string, Review>();

    // 1. Supabase First
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.${businessId.replace(/^biz_/, '')}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          for (const r of data) {
            const biz = r.business_id || r.businessId || '';
            if (isMatchingBusiness(biz, businessId)) {
              reviewMap.set(r.id, {
                id: r.id,
                businessId: biz,
                rating: Number(r.rating || 5),
                customerName: r.customer_name || r.customerName || 'Cliente',
                customerPhone: r.customer_phone || r.customerPhone || '',
                customerEmail: r.customer_email || r.customerEmail || '',
                channel: (r.channel || 'qr').toLowerCase() as any,
                createdAt: r.created_at || r.createdAt || new Date().toISOString()
              });
            }
          }
        }
      } catch (err) {
        console.warn('[subscribeReviews] Supabase query warning:', err);
      }
    }

    // 2. Server API fallback
    try {
      const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const r of data) {
            const biz = r.businessId || r.business_id || '';
            if (isMatchingBusiness(biz, businessId) && !reviewMap.has(r.id)) {
              reviewMap.set(r.id, {
                id: r.id,
                businessId: biz,
                rating: Number(r.rating || 5),
                customerName: r.customerName || r.customer_name || 'Cliente',
                customerPhone: r.customerPhone || r.customer_phone || '',
                customerEmail: r.customerEmail || r.customer_email || '',
                channel: (r.channel || 'qr').toLowerCase() as any,
                createdAt: r.createdAt || r.created_at || new Date().toISOString()
              });
            }
          }
        }
      }
    } catch {}

    const list = Array.from(reviewMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    setCached(LOCAL_STORAGE_KEY_REVIEWS, list);
    callback(list);
  };

  fetchAllSources();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    try {
      channel = supabase
        .channel(`reviews_realtime_${businessId || 'all'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
          fetchAllSources();
        })
        .subscribe();
    } catch {}
  }

  const handleSync = () => fetchAllSources();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_reviews_updated', handleSync);
    window.addEventListener('reputaflow_live_sync', handleSync);
  }

  const interval = setInterval(fetchAllSources, 4000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_reviews_updated', handleSync);
      window.removeEventListener('reputaflow_live_sync', handleSync);
    }
    clearInterval(interval);
  };
}

export async function submitReview(data: {
  businessId: string;
  rating: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  comment?: string;
  channel?: 'qr' | 'whatsapp' | 'email' | 'link';
  source?: 'google' | 'direct' | 'recovery';
  isInternalFeedback?: boolean;
}): Promise<{ reviewId: string }> {
  const reviewId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const isInternal = data.isInternalFeedback !== undefined ? data.isInternalFeedback : data.rating <= 3;
  const src = data.source || (data.rating >= 4 ? 'google' : 'recovery');

  const supabasePayload = {
    id: reviewId,
    business_id: data.businessId,
    rating: Number(data.rating),
    customer_name: data.customerName || 'Cliente',
    customer_phone: data.customerPhone || null,
    customer_email: data.customerEmail || null,
    comment: data.comment || null,
    channel: data.channel || 'qr',
    is_internal_feedback: isInternal,
    source: src,
    created_at: now
  };

  // 1. Direct write to Supabase
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('reviews').insert([supabasePayload]);
    } catch (err) {
      console.warn('[Supabase reviews insert catch]:', err);
    }
  }

  // 2. Server API write
  try {
    await apiFetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...supabasePayload,
        businessId: data.businessId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        isInternalFeedback: isInternal
      })
    });
  } catch {}

  // 3. Upsert Customer in CRM if phone or name is present
  if (data.customerPhone || (data.customerName && data.customerName !== 'Cliente')) {
    upsertCustomerRecord({
      businessId: data.businessId,
      name: data.customerName || 'Cliente',
      phone: data.customerPhone || '',
      email: data.customerEmail || '',
      rating: data.rating,
      lastReviewAt: now
    }).catch(() => {});
  }

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  return { reviewId };
}

export async function deleteReview(reviewId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('reviews').delete().eq('id', reviewId);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
  } catch (e) {}

  const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
  setCached(LOCAL_STORAGE_KEY_REVIEWS, cached.filter((r) => r.id !== reviewId));

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }
}

export async function clearAllReviews(businessId?: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      if (businessId) {
        await supabase.from('reviews').delete().eq('business_id', businessId);
      } else {
        await supabase.from('reviews').delete().neq('id', '');
      }
    } catch (e) {}
  }

  try {
    const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
    await apiFetch(url, { method: 'DELETE' });
  } catch (e) {}

  if (businessId) {
    const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
    setCached(LOCAL_STORAGE_KEY_REVIEWS, cached.filter((r) => !isMatchingBusiness(r.businessId, businessId)));
  } else {
    setCached(LOCAL_STORAGE_KEY_REVIEWS, []);
  }

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }
}

// ==========================================
// FEEDBACK & RECOVERY CASES
// ==========================================
export function subscribeFeedback(businessId: string | null, callback: (feedbacks: Feedback[]) => void) {
  const fetchAll = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('feedback').select('*').order('created_at', { ascending: false });
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.${businessId.replace(/^biz_/, '')}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const mapped: Feedback[] = data.map((f: any) => ({
            id: f.id,
            businessId: f.business_id || f.businessId || '',
            reviewId: f.review_id || f.reviewId || '',
            customerId: f.customer_id || f.customerId || '',
            customerName: f.customer_name || f.customerName || 'Cliente',
            customerPhone: f.customer_phone || f.customerPhone || '',
            customerEmail: f.customer_email || f.customerEmail || '',
            rating: Number(f.rating || 1),
            question1: f.question1 || f.reason || '',
            question2: f.question2 || f.comment || '',
            question3WantsContact: f.question3_wants_contact !== undefined ? Boolean(f.question3_wants_contact) : true,
            createdAt: f.created_at || f.createdAt || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_FEEDBACK, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    try {
      const url = businessId ? `/api/feedback?businessId=${encodeURIComponent(businessId)}` : '/api/feedback';
      const res = await apiFetch(url);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          setCached(LOCAL_STORAGE_KEY_FEEDBACK, list);
          callback(list);
          return;
        }
      }
    } catch {}

    callback(getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []));
  };

  fetchAll();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    try {
      channel = supabase
        .channel(`feedback_realtime_${businessId || 'all'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, () => fetchAll())
        .subscribe();
    } catch {}
  }

  const handleSync = () => fetchAll();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_feedback_updated', handleSync);
    window.addEventListener('reputaflow_live_sync', handleSync);
  }

  const interval = setInterval(fetchAll, 4000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_feedback_updated', handleSync);
      window.removeEventListener('reputaflow_live_sync', handleSync);
    }
    clearInterval(interval);
  };
}

export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  const fetchAll = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('recovery_cases').select('*').order('created_at', { ascending: false });
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.${businessId.replace(/^biz_/, '')}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const mapped: RecoveryCase[] = data.map((c: any) => ({
            id: c.id,
            businessId: c.business_id || c.businessId || '',
            reviewId: c.review_id || c.reviewId || '',
            customerId: c.customer_id || c.customerId || '',
            customerName: c.customer_name || c.customerName || 'Cliente',
            customerPhone: c.customer_phone || c.customerPhone || '',
            customerEmail: c.customer_email || c.customerEmail || '',
            rating: Number(c.rating || 1),
            status: (c.status || 'novo') as RecoveryCaseStatus,
            summary: c.summary || c.reason || c.comment || '',
            notes: c.notes || c.resolution_notes || '',
            assignedTo: c.assigned_to || '',
            createdAt: c.created_at || c.createdAt || new Date().toISOString(),
            updatedAt: c.updated_at || c.updatedAt || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_CASES, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    try {
      const url = businessId ? `/api/recovery_cases?businessId=${encodeURIComponent(businessId)}` : '/api/recovery_cases';
      const res = await apiFetch(url);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          setCached(LOCAL_STORAGE_KEY_CASES, list);
          callback(list);
          return;
        }
      }
    } catch {}

    callback(getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []));
  };

  fetchAll();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    try {
      channel = supabase
        .channel(`cases_realtime_${businessId || 'all'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recovery_cases' }, () => fetchAll())
        .subscribe();
    } catch {}
  }

  const handleSync = () => fetchAll();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_cases_updated', handleSync);
    window.addEventListener('reputaflow_live_sync', handleSync);
  }

  const interval = setInterval(fetchAll, 4000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_cases_updated', handleSync);
      window.removeEventListener('reputaflow_live_sync', handleSync);
    }
    clearInterval(interval);
  };
}

export async function submitFeedbackAndRecovery(data: {
  businessId: string;
  reviewId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  rating: number;
  question1: string;
  question2: string;
  question3WantsContact?: boolean;
}): Promise<void> {
  const fbId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const caseId = `case_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const fbPayload = {
    id: fbId,
    business_id: data.businessId,
    review_id: data.reviewId,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    customer_email: data.customerEmail || null,
    rating: Number(data.rating),
    question1: data.question1,
    question2: data.question2,
    question3_wants_contact: data.question3WantsContact !== false,
    created_at: now
  };

  const casePayload = {
    id: caseId,
    business_id: data.businessId,
    review_id: data.reviewId,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    customer_email: data.customerEmail || null,
    rating: Number(data.rating),
    status: 'novo',
    summary: data.question2 || data.question1 || 'Feedback insatisfatório recebido',
    created_at: now,
    updated_at: now
  };

  // 1. Supabase write
  if (isSupabaseConfigured()) {
    try {
      await Promise.all([
        supabase.from('feedback').insert([fbPayload]),
        supabase.from('recovery_cases').insert([casePayload])
      ]);
    } catch (e) {
      console.warn('[Supabase feedback & recovery insert warning]:', e);
    }
  }

  // 2. Server API write
  try {
    await Promise.all([
      apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fbPayload, businessId: data.businessId, reviewId: data.reviewId })
      }),
      apiFetch('/api/recovery_cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...casePayload, businessId: data.businessId, reviewId: data.reviewId })
      })
    ]);
  } catch {}

  // 3. Mark customer in CRM as needing recovery
  upsertCustomerRecord({
    businessId: data.businessId,
    name: data.customerName,
    phone: data.customerPhone,
    email: data.customerEmail || '',
    rating: data.rating,
    status: 'in_recovery',
    lastReviewAt: now
  }).catch(() => {});

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_feedback_updated'));
    window.dispatchEvent(new CustomEvent('reputaflow_cases_updated'));
  }
}

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  const now = new Date().toISOString();
  const updates: any = { status, updated_at: now };
  if (notes) updates.notes = notes;

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('recovery_cases').update(updates).eq('id', caseId);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/recovery_cases/${encodeURIComponent(caseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_cases_updated'));
  }
}

// ==========================================
// CUSTOMERS (CRM)
// ==========================================
export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  const fetchAll = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('customers').select('*').order('last_review_at', { ascending: false });
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.${businessId.replace(/^biz_/, '')}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const mapped: Customer[] = data.map((c: any) => ({
            id: c.id,
            businessId: c.business_id || c.businessId || '',
            name: c.name || 'Cliente',
            phone: c.phone || '',
            email: c.email || '',
            reviewsCount: Number(c.reviews_count || c.total_reviews || 1),
            avgRating: Number(c.avg_rating || c.average_rating || 5),
            status: (c.status || 'active') as any,
            internalNotes: c.internal_notes || '',
            lastReviewAt: c.last_review_at || c.lastReviewAt || new Date().toISOString(),
            createdAt: c.created_at || c.createdAt || new Date().toISOString(),
            updatedAt: c.updated_at || c.updatedAt || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_CUSTOMERS, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    try {
      const url = businessId ? `/api/customers?businessId=${encodeURIComponent(businessId)}` : '/api/customers';
      const res = await apiFetch(url);
      if (res.ok) {
        const list: any[] = await res.json();
        if (Array.isArray(list)) {
          const mapped: Customer[] = list.map((c: any) => ({
            id: c.id,
            businessId: c.businessId || c.business_id || '',
            name: c.name || 'Cliente',
            phone: c.phone || '',
            email: c.email || '',
            reviewsCount: Number(c.reviewsCount || c.reviews_count || c.total_reviews || 1),
            avgRating: Number(c.avgRating || c.avg_rating || c.average_rating || 5),
            status: c.status || 'active',
            internalNotes: c.internalNotes || '',
            lastReviewAt: c.lastReviewAt || c.last_review_at || new Date().toISOString(),
            createdAt: c.createdAt || c.created_at || new Date().toISOString(),
            updatedAt: c.updatedAt || c.updated_at || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_CUSTOMERS, mapped);
          callback(mapped);
          return;
        }
      }
    } catch {}

    callback(getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []));
  };

  fetchAll();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    try {
      channel = supabase
        .channel(`customers_realtime_${businessId || 'all'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchAll())
        .subscribe();
    } catch {}
  }

  const handleSync = () => fetchAll();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_customers_updated', handleSync);
    window.addEventListener('reputaflow_live_sync', handleSync);
  }

  const interval = setInterval(fetchAll, 4000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_customers_updated', handleSync);
      window.removeEventListener('reputaflow_live_sync', handleSync);
    }
    clearInterval(interval);
  };
}

async function upsertCustomerRecord(data: {
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  rating: number;
  status?: string;
  lastReviewAt?: string;
}): Promise<void> {
  const cleanPhone = (data.phone || '').replace(/\D/g, '');
  const id = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = data.lastReviewAt || new Date().toISOString();

  const payload = {
    id,
    business_id: data.businessId,
    name: data.name,
    phone: data.phone,
    email: data.email || null,
    reviews_count: 1,
    avg_rating: Number(data.rating),
    status: data.status || (data.rating <= 3 ? 'in_recovery' : 'active'),
    last_review_at: now,
    created_at: now,
    updated_at: now
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('customers').insert([payload]);
    } catch (e) {}
  }

  try {
    await apiFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        businessId: data.businessId,
        reviewsCount: 1,
        avgRating: data.rating,
        lastReviewAt: now
      })
    });
  } catch {}

  notifyDataChanged();
}

export async function updateCustomer(customerId: string, data: Partial<Customer>): Promise<void> {
  const now = new Date().toISOString();
  const dbUpdates: any = { updated_at: now };
  if (data.name !== undefined) dbUpdates.name = data.name;
  if (data.phone !== undefined) dbUpdates.phone = data.phone;
  if (data.email !== undefined) dbUpdates.email = data.email;
  if (data.status !== undefined) dbUpdates.status = data.status;
  if (data.internalNotes !== undefined) {
    dbUpdates.internal_notes = data.internalNotes;
    dbUpdates.internalNotes = data.internalNotes;
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('customers').update(dbUpdates).eq('id', customerId);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/customers/${encodeURIComponent(customerId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbUpdates)
    });
  } catch {}

  const cached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
  setCached(
    LOCAL_STORAGE_KEY_CUSTOMERS,
    cached.map((c) => (c.id === customerId ? { ...c, ...data, updatedAt: now } : c))
  );

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_customers_updated'));
  }
}

// ==========================================
// INTERACTIONS & NOTES
// ==========================================
export function subscribeInteractions(businessId: string | null, callback: (interactions: Interaction[]) => void) {
  const fetchAll = async () => {
    try {
      const url = businessId ? `/api/interactions?businessId=${encodeURIComponent(businessId)}` : '/api/interactions';
      const res = await apiFetch(url);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          callback(list);
          return;
        }
      }
    } catch {}
    callback([]);
  };

  fetchAll();
  const interval = setInterval(fetchAll, 6000);
  return () => clearInterval(interval);
}

export async function addInteraction(data: Omit<Interaction, 'id' | 'createdAt'>): Promise<Interaction> {
  const id = `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const record: Interaction = {
    ...data,
    id,
    createdAt: now
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('interactions').insert([{
        id,
        business_id: data.businessId,
        customer_id: data.customerId || null,
        case_id: data.caseId || null,
        type: data.type,
        summary: data.summary,
        outcome: data.outcome || null,
        staff_email: data.staffEmail,
        staff_name: data.staffName || '',
        created_at: now
      }]);
    } catch (e) {}
  }

  try {
    await apiFetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
  } catch {}

  notifyDataChanged();
  return record;
}

// ==========================================
// PLANS & PLATFORM SETTINGS
// ==========================================
export async function getPlans(): Promise<Plan[]> {
  const defaultPlans: Plan[] = [
    {
      id: 'plan_starter',
      name: 'Starter',
      price: 99,
      currency: 'BRL',
      maxBusinesses: 1,
      maxReviewsMonth: 100,
      features: ['1 Estabelecimento', 'Até 100 avaliações/mês', 'QR Code de Mesa', 'Dashboard Básico'],
      isActive: true
    },
    {
      id: 'plan_pro',
      name: 'Profissional',
      price: 199,
      currency: 'BRL',
      maxBusinesses: 3,
      maxReviewsMonth: 500,
      features: ['3 Estabelecimentos', 'Até 500 avaliações/mês', 'Filtro Inteligente 4-5★', 'CRM de Recuperação', 'Suporte Prioritário'],
      isActive: true
    },
    {
      id: 'plan_enterprise',
      name: 'Enterprise',
      price: 399,
      currency: 'BRL',
      maxBusinesses: 10,
      maxReviewsMonth: 2000,
      features: ['10 Estabelecimentos', 'Avaliações Ilimitadas', 'Gestor de Conta Dedicado', 'Integrações Personalizadas', 'White-Label Completo'],
      isActive: true
    }
  ];

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from('plans').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price || 0),
          currency: p.currency || 'EUR',
          maxBusinesses: p.max_businesses || p.maxBusinesses || 1,
          maxReviewsMonth: p.max_reviews_month || p.maxReviewsMonth || 100,
          features: Array.isArray(p.features) ? p.features : (typeof p.features === 'string' ? JSON.parse(p.features) : []),
          isActive: p.is_active !== undefined ? Boolean(p.is_active) : true
        }));
      }
    } catch {}
  }

  return defaultPlans;
}

export async function savePlan(plan: Plan): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('plans').upsert([{
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        max_businesses: plan.maxBusinesses,
        max_reviews_month: plan.maxReviewsMonth,
        features: JSON.stringify(plan.features),
        is_active: plan.isActive
      }]);
    } catch (e) {}
  }

  const cached = getCached<Plan[]>(LOCAL_STORAGE_KEY_PLANS, []);
  const idx = cached.findIndex((p) => p.id === plan.id);
  if (idx !== -1) cached[idx] = plan;
  else cached.push(plan);
  setCached(LOCAL_STORAGE_KEY_PLANS, cached);
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const defaultSettings: PlatformSettings = {
    id: 'settings_default',
    platformName: 'ReputaFlow',
    supportEmail: 'suporte@reputaflow.com',
    defaultGoogleReviewInstructions: 'Deixe a sua avaliação oficial de 5 estrelas no Google para nos ajudar.',
    allowPublicRegistration: true
  };

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from('platform_settings').select('*').limit(1);
      if (!error && data && data[0]) {
        const s = data[0];
        return {
          id: s.id,
          platformName: s.platform_name || s.platformName || 'ReputaFlow',
          supportEmail: s.support_email || s.supportEmail || 'suporte@reputaflow.com',
          defaultGoogleReviewInstructions: s.default_instructions || s.defaultGoogleReviewInstructions || defaultSettings.defaultGoogleReviewInstructions,
          allowPublicRegistration: s.allow_registrations !== undefined ? s.allow_registrations : true
        };
      }
    } catch {}
  }

  return defaultSettings;
}

export async function savePlatformSettings(settings: Partial<PlatformSettings>): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('platform_settings').upsert([{
        id: settings.id || 'settings_default',
        platform_name: settings.platformName,
        support_email: settings.supportEmail,
        default_instructions: settings.defaultGoogleReviewInstructions,
        allow_registrations: settings.allowPublicRegistration
      }]);
    } catch (e) {}
  }

  setCached(LOCAL_STORAGE_KEY_SETTINGS, settings);
}
