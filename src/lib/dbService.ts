import { Business, Review, Feedback, RecoveryCase, RecoveryCaseStatus, Customer, Interaction, Plan, PlatformSettings } from '../types/index.ts';
import { supabase, isSupabaseConfigured, uploadBusinessLogo } from './supabase.ts';

// Initial pre-configured businesses
export const REGISTERED_BUSINESSES: Business[] = [
  {
    id: 'biz_mrnavalha',
    name: 'Mr. Navalha Barbearia',
    slug: 'mrnavalha',
    category: 'Barbearia & Cuidados Masculinos',
    address: 'Av. Liberdade 123, Lisboa',
    phone: '+351 912 345 678',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    logoUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=300',
    bannerUrl: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&q=80&w=1200',
    minRatingForGoogle: 4,
    qrThemeColor: '#4f46e5',
    activePlan: 'pro',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'biz_pastelsabor',
    name: 'Pastel & Sabor',
    slug: 'pastelsabor',
    category: 'Padaria & Confeitaria',
    address: 'Rua das Flores 45, Porto',
    phone: '+351 923 456 789',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    logoUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=300',
    minRatingForGoogle: 4,
    qrThemeColor: '#d97706',
    activePlan: 'starter',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_businesses';
const LOCAL_STORAGE_KEY_REVIEWS = 'reputaflow_reviews_cache';
const LOCAL_STORAGE_KEY_FEEDBACK = 'reputaflow_feedback_cache';
const LOCAL_STORAGE_KEY_CASES = 'reputaflow_cases_cache';
const LOCAL_STORAGE_KEY_CUSTOMERS = 'reputaflow_customers_cache';

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
// IMAGE UPLOAD SERVICE (SUPABASE STORAGE)
// ==========================================
export async function uploadImage(file: File, businessId?: string): Promise<string> {
  const currentMerchantId = businessId || 'biz_mrnavalha';
  const publicUrl = await uploadBusinessLogo(file, currentMerchantId);

  try {
    const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
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
    // 1. Supabase
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('businesses').select('*');
        if (!error && data && data.length > 0) {
          const mapped: Business[] = data.map((b: any) => ({
            id: b.id,
            name: b.name,
            slug: b.slug,
            category: b.category,
            address: b.address,
            phone: b.phone,
            googleReviewUrl: b.google_review_url || b.googleReviewUrl || '',
            logoUrl: b.logo_url || b.logoUrl || '',
            bannerUrl: b.banner_url || b.bannerUrl || '',
            minRatingForGoogle: b.min_rating_for_google || b.minRatingForGoogle || 4,
            qrThemeColor: b.qr_theme_color || b.qrThemeColor || '#4f46e5',
            activePlan: (b.active_plan || b.activePlan || 'starter') as any,
            createdAt: b.created_at || b.createdAt || new Date().toISOString(),
            updatedAt: b.updated_at || b.updatedAt || new Date().toISOString()
          }));
          setCached(LOCAL_STORAGE_KEY_BIZ, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    // 2. Server API
    try {
      const res = await apiFetch('/api/businesses');
      if (res.ok) {
        const data: Business[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCached(LOCAL_STORAGE_KEY_BIZ, data);
          callback(data);
          return;
        }
      }
    } catch (e) {}

    // 3. Fallback
    callback(getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES));
  };

  fetchAll();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    channel = supabase
      .channel('businesses_realtime_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
        fetchAll();
      })
      .subscribe();
  }

  const handleCustomEvent = () => fetchAll();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_businesses_updated', handleCustomEvent);
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  const interval = setInterval(fetchAll, 4000);

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
  const normSlug = normalizeKey(slug);
  if (!normSlug) return null;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .or(`slug.eq.${slug},slug.eq.${normSlug},id.eq.${slug}`);

      if (!error && data && data.length > 0) {
        const b = data[0];
        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          category: b.category,
          address: b.address,
          phone: b.phone,
          googleReviewUrl: b.google_review_url || b.googleReviewUrl || '',
          logoUrl: b.logo_url || b.logoUrl || '',
          bannerUrl: b.banner_url || b.bannerUrl || '',
          minRatingForGoogle: b.min_rating_for_google || b.minRatingForGoogle || 4,
          qrThemeColor: b.qr_theme_color || b.qrThemeColor || '#4f46e5',
          activePlan: (b.active_plan || b.activePlan || 'starter') as any,
          createdAt: b.created_at || b.createdAt || new Date().toISOString(),
          updatedAt: b.updated_at || b.updatedAt || new Date().toISOString()
        };
      }
    } catch (e) {}
  }

  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(slug)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  const cached = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
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
  return getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
}

export async function addBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business> {
  const id = `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const slug = data.slug || normalizeKey(data.name);

  const newBiz: Business = {
    ...data,
    id,
    slug,
    createdAt: now,
    updatedAt: now
  };

  const dbPayload = {
    id,
    name: data.name,
    slug,
    category: data.category || '',
    address: data.address || '',
    phone: data.phone || '',
    google_review_url: data.googleReviewUrl || '',
    googleReviewUrl: data.googleReviewUrl || '',
    logo_url: data.logoUrl || '',
    logoUrl: data.logoUrl || '',
    banner_url: data.bannerUrl || '',
    bannerUrl: data.bannerUrl || '',
    min_rating_for_google: data.minRatingForGoogle || 4,
    minRatingForGoogle: data.minRatingForGoogle || 4,
    qr_theme_color: data.qrThemeColor || '#4f46e5',
    qrThemeColor: data.qrThemeColor || '#4f46e5',
    active_plan: data.activePlan || 'starter',
    activePlan: data.activePlan || 'starter',
    created_at: now,
    updated_at: now
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('businesses').insert([{
        id,
        name: data.name,
        slug,
        category: data.category || '',
        address: data.address || '',
        phone: data.phone || '',
        google_review_url: data.googleReviewUrl || '',
        logo_url: data.logoUrl || '',
        banner_url: data.bannerUrl || '',
        min_rating_for_google: data.minRatingForGoogle || 4,
        qr_theme_color: data.qrThemeColor || '#4f46e5',
        active_plan: data.activePlan || 'starter',
        created_at: now,
        updated_at: now
      }]);
    } catch (e) {}
  }

  try {
    await apiFetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbPayload)
    });
  } catch (err) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  setCached(LOCAL_STORAGE_KEY_BIZ, [...list, newBiz]);
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }

  return newBiz;
}

export const createBusiness = addBusiness;

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const dbUpdates: any = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) dbUpdates.name = data.name;
  if (data.slug !== undefined) dbUpdates.slug = data.slug;
  if (data.category !== undefined) dbUpdates.category = data.category;
  if (data.address !== undefined) dbUpdates.address = data.address;
  if (data.phone !== undefined) dbUpdates.phone = data.phone;
  if (data.googleReviewUrl !== undefined) {
    dbUpdates.google_review_url = data.googleReviewUrl;
    dbUpdates.googleReviewUrl = data.googleReviewUrl;
  }
  if (data.logoUrl !== undefined) {
    dbUpdates.logo_url = data.logoUrl;
    dbUpdates.logoUrl = data.logoUrl;
  }
  if (data.bannerUrl !== undefined) {
    dbUpdates.banner_url = data.bannerUrl;
    dbUpdates.bannerUrl = data.bannerUrl;
  }
  if (data.minRatingForGoogle !== undefined) {
    dbUpdates.min_rating_for_google = data.minRatingForGoogle;
    dbUpdates.minRatingForGoogle = data.minRatingForGoogle;
  }
  if (data.qrThemeColor !== undefined) {
    dbUpdates.qr_theme_color = data.qrThemeColor;
    dbUpdates.qrThemeColor = data.qrThemeColor;
  }
  if (data.activePlan !== undefined) {
    dbUpdates.active_plan = data.activePlan;
    dbUpdates.activePlan = data.activePlan;
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('businesses').update(dbUpdates).eq('id', id);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbUpdates)
    });
  } catch (err) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  const updatedList = list.map((b) => (b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b));
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

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  setCached(LOCAL_STORAGE_KEY_BIZ, list.filter((b) => b.id !== id));
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }
}

// ==========================================
// REVIEWS (RESILIENT DUAL-WRITE & MERGED SYNC)
// ==========================================
export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const fetchAllSources = async () => {
    const reviewMap = new Map<string, Review>();

    // 1. Local Cache
    try {
      const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
      for (const r of cached) {
        if (isMatchingBusiness(r.businessId, businessId)) {
          reviewMap.set(r.id, r);
        }
      }
    } catch {}

    // 2. Server API
    try {
      const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const r of data) {
            const biz = r.businessId || r.business_id || '';
            if (isMatchingBusiness(biz, businessId)) {
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
    } catch (e) {}

    // 3. Supabase Direct
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('reviews').select('*');
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.biz_${businessId}`);
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
        console.warn('Supabase fetch reviews warning:', err);
      }
    }

    const merged = Array.from(reviewMap.values());
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Sync back to local storage cache
    try {
      const allCached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
      const allMap = new Map<string, Review>();
      for (const r of allCached) allMap.set(r.id, r);
      for (const r of merged) allMap.set(r.id, r);
      setCached(LOCAL_STORAGE_KEY_REVIEWS, Array.from(allMap.values()));
    } catch {}

    callback(merged);
  };

  fetchAllSources();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `crm_reviews_channel_${businessId || 'all'}_${Math.random().toString(36).substring(2, 6)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        fetchAllSources();
      })
      .on('broadcast', { event: 'review_created' }, () => {
        fetchAllSources();
      })
      .on('broadcast', { event: 'review_deleted' }, () => {
        fetchAllSources();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchAllSources();
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchAllSources();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
    window.addEventListener('reputaflow_reviews_updated', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);
    window.addEventListener('focus', handleSyncEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  const interval = setInterval(fetchAllSources, 3000);

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
      window.removeEventListener('reputaflow_reviews_updated', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
      window.removeEventListener('focus', handleSyncEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    clearInterval(interval);
  };
}

export async function submitReview(
  data: Omit<Review, 'id' | 'createdAt'>
): Promise<{ reviewId: string }> {
  const targetId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newReview: Review = {
    id: targetId,
    businessId: data.businessId,
    rating: Number(data.rating),
    customerName: data.customerName?.trim() || 'Cliente',
    customerPhone: data.customerPhone?.trim() || '',
    customerEmail: data.customerEmail?.trim() || '',
    channel: (data.channel || 'qr').toLowerCase() as any,
    createdAt: now
  };

  // 1. Immediately cache locally for instant zero-latency UI reflection
  try {
    const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
    setCached(LOCAL_STORAGE_KEY_REVIEWS, [newReview, ...cached.filter((r) => r.id !== targetId)]);
  } catch {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  const dbPayload = {
    id: targetId,
    businessId: data.businessId,
    business_id: data.businessId,
    rating: Number(data.rating),
    customerName: newReview.customerName,
    customer_name: newReview.customerName,
    customerPhone: newReview.customerPhone || null,
    customer_phone: newReview.customerPhone || null,
    customerEmail: newReview.customerEmail || null,
    customer_email: newReview.customerEmail || null,
    channel: newReview.channel,
    createdAt: now,
    created_at: now
  };

  const supabasePayload = {
    id: targetId,
    business_id: data.businessId,
    rating: Number(data.rating),
    customer_name: newReview.customerName,
    customer_phone: newReview.customerPhone || null,
    customer_email: newReview.customerEmail || null,
    channel: newReview.channel,
    created_at: now
  };

  const tasks: Promise<any>[] = [];

  // 2. Server API write
  tasks.push(
    apiFetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbPayload)
    }).catch((err) => console.warn('API review post warning:', err))
  );

  // 3. Supabase Direct write
  if (isSupabaseConfigured()) {
    tasks.push(
      (async () => {
        try {
          const { error } = await supabase.from('reviews').insert([supabasePayload]).select();
          if (error) {
            console.warn('[Supabase Insert Review Warning]:', error);
          } else {
            try {
              const syncChannel = supabase.channel(`crm_reviews_channel_${data.businessId || 'all'}`);
              await syncChannel.send({
                type: 'broadcast',
                event: 'review_created',
                payload: supabasePayload
              });
            } catch {}
          }
        } catch (e: any) {
          console.warn('Supabase review insert exception:', e);
        }
      })()
    );
  }

  // 4. CRM Customer update
  if (data.customerName || data.customerPhone) {
    tasks.push(
      upsertCustomerByPhone({
        businessId: data.businessId,
        name: data.customerName || 'Cliente',
        phone: data.customerPhone || '',
        email: data.customerEmail || '',
        rating: data.rating,
        status: data.rating >= 4 ? 'active' : 'in_recovery',
        internalNotes: `Avaliação de ${data.rating} estrelas via ${data.channel || 'QR'}`
      }).catch(() => {})
    );
  }

  await Promise.allSettled(tasks);

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  return { reviewId: targetId };
}

export async function deleteReview(reviewId: string): Promise<void> {
  // 1. Remove from local storage
  try {
    const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
    setCached(LOCAL_STORAGE_KEY_REVIEWS, cached.filter((r) => r.id !== reviewId));
  } catch {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  // 2. Supabase delete
  if (isSupabaseConfigured()) {
    try {
      await Promise.all([
        supabase.from('reviews').delete().eq('id', reviewId),
        supabase.from('feedback').delete().eq('review_id', reviewId),
        supabase.from('recovery_cases').delete().eq('review_id', reviewId)
      ]);

      try {
        const syncChannel = supabase.channel('crm_reviews_channel_all');
        syncChannel.send({
          type: 'broadcast',
          event: 'review_deleted',
          payload: { reviewId }
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.warn('Supabase delete review error:', e);
    }
  }

  // 3. API delete
  try {
    await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE'
    });
  } catch (err) {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }
}

export async function clearAllReviews(businessId?: string): Promise<void> {
  // 1. Clear local cache
  try {
    if (businessId) {
      const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
      setCached(LOCAL_STORAGE_KEY_REVIEWS, cached.filter((r) => !isMatchingBusiness(r.businessId, businessId)));
    } else {
      setCached(LOCAL_STORAGE_KEY_REVIEWS, []);
    }
  } catch {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  // 2. Supabase clear
  if (isSupabaseConfigured()) {
    try {
      if (businessId) {
        await Promise.all([
          supabase.from('reviews').delete().eq('business_id', businessId),
          supabase.from('feedback').delete().eq('business_id', businessId),
          supabase.from('recovery_cases').delete().eq('business_id', businessId)
        ]);
      } else {
        await Promise.all([
          supabase.from('reviews').delete().gte('rating', 0),
          supabase.from('feedback').delete().gte('rating', 0),
          supabase.from('recovery_cases').delete().gte('rating', 0)
        ]);
      }

      try {
        const syncChannel = supabase.channel(`crm_reviews_channel_${businessId || 'all'}`);
        syncChannel.send({
          type: 'broadcast',
          event: 'review_deleted',
          payload: { clearAll: true, businessId }
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.warn('Supabase clear all reviews error:', e);
    }
  }

  // 3. API clear
  try {
    const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
    await apiFetch(url, { method: 'DELETE' });
  } catch (err) {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }
}

// ==========================================
// FEEDBACK & RECOVERY (RESILIENT DUAL-WRITE)
// ==========================================
export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  const fetchAllSources = async () => {
    const fbMap = new Map<string, Feedback>();

    // 1. Local Cache
    try {
      const cached = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []);
      for (const f of cached) {
        if (isMatchingBusiness(f.businessId, businessId)) {
          fbMap.set(f.id, f);
        }
      }
    } catch {}

    // 2. Server API
    try {
      const url = businessId ? `/api/feedback?businessId=${encodeURIComponent(businessId)}` : '/api/feedback';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const f of data) {
            const biz = f.businessId || f.business_id || '';
            if (isMatchingBusiness(biz, businessId)) {
              fbMap.set(f.id, {
                id: f.id,
                businessId: biz,
                reviewId: f.reviewId || f.review_id || '',
                customerId: f.customerId || f.customer_id || '',
                customerName: f.customerName || f.customer_name || 'Cliente',
                customerPhone: f.customerPhone || f.customer_phone || '',
                customerEmail: f.customerEmail || f.customer_email || '',
                rating: Number(f.rating || 1),
                question1: f.question1 || '',
                question2: f.question2 || '',
                question3WantsContact: Boolean(f.question3WantsContact ?? f.question3_wants_contact ?? true),
                createdAt: f.createdAt || f.created_at || new Date().toISOString()
              });
            }
          }
        }
      }
    } catch (e) {}

    // 3. Supabase Direct
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('feedback').select('*');
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.biz_${businessId}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          for (const f of data) {
            const biz = f.business_id || f.businessId || '';
            if (isMatchingBusiness(biz, businessId)) {
              fbMap.set(f.id, {
                id: f.id,
                businessId: biz,
                reviewId: f.review_id || f.reviewId || '',
                customerId: f.customer_id || f.customerId || '',
                customerName: f.customer_name || f.customerName || 'Cliente',
                customerPhone: f.customer_phone || f.customerPhone || '',
                customerEmail: f.customer_email || f.customerEmail || '',
                rating: Number(f.rating || 1),
                question1: f.question1 || '',
                question2: f.question2 || '',
                question3WantsContact: Boolean(f.question3_wants_contact ?? true),
                createdAt: f.created_at || f.createdAt || new Date().toISOString()
              });
            }
          }
        }
      } catch (err) {
        console.warn('Supabase feedback fetch error:', err);
      }
    }

    const merged = Array.from(fbMap.values());
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    try {
      const allCached = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []);
      const allMap = new Map<string, Feedback>();
      for (const f of allCached) allMap.set(f.id, f);
      for (const f of merged) allMap.set(f.id, f);
      setCached(LOCAL_STORAGE_KEY_FEEDBACK, Array.from(allMap.values()));
    } catch {}

    callback(merged);
  };

  fetchAllSources();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `realtime_feedback_${businessId || 'all'}_${Math.random().toString(36).substring(2, 6)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, () => {
        fetchAllSources();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchAllSources();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
    window.addEventListener('reputaflow_reviews_updated', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);
  }

  const interval = setInterval(fetchAllSources, 3000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
      window.removeEventListener('reputaflow_reviews_updated', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
    }
    clearInterval(interval);
  };
}

export const submitFeedbackAndRecovery = submitNegativeFeedback;

export async function submitNegativeFeedback(params: {
  businessId: string;
  reviewId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  rating: number;
  question1: string;
  question2: string;
  question3WantsContact: boolean;
}): Promise<{ feedbackId: string; caseId: string; customerId: string }> {
  const now = new Date().toISOString();
  const fbId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const caseId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const customerId = await upsertCustomerByPhone({
    businessId: params.businessId,
    name: params.customerName,
    phone: params.customerPhone,
    email: params.customerEmail,
    rating: params.rating,
    status: 'in_recovery',
    internalNotes: `Feedback de insatisfação (${params.rating} estrelas): ${params.question1.slice(0, 120)}`
  });

  const fbRecord: Feedback = {
    id: fbId,
    businessId: params.businessId,
    reviewId: params.reviewId,
    customerId: customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    rating: params.rating,
    question1: params.question1,
    question2: params.question2,
    question3WantsContact: params.question3WantsContact,
    createdAt: now
  };

  const caseRecord: RecoveryCase = {
    id: caseId,
    businessId: params.businessId,
    customerId: customerId,
    reviewId: params.reviewId,
    feedbackId: fbId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    rating: params.rating,
    status: 'novo',
    notes: params.question1,
    assignedTo: '',
    createdAt: now,
    updatedAt: now
  };

  // 1. Instant local cache
  try {
    const fbCached = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []);
    setCached(LOCAL_STORAGE_KEY_FEEDBACK, [fbRecord, ...fbCached.filter((f) => f.id !== fbId)]);

    const caseCached = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
    setCached(LOCAL_STORAGE_KEY_CASES, [caseRecord, ...caseCached.filter((c) => c.id !== caseId)]);
  } catch {}

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  const fbPayload = {
    id: fbId,
    businessId: params.businessId,
    business_id: params.businessId,
    reviewId: params.reviewId,
    review_id: params.reviewId,
    customerId: customerId,
    customer_id: customerId,
    customerName: params.customerName,
    customer_name: params.customerName,
    customerPhone: params.customerPhone,
    customer_phone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    customer_email: params.customerEmail || '',
    rating: params.rating,
    question1: params.question1,
    question2: params.question2,
    question3WantsContact: params.question3WantsContact,
    question3_wants_contact: params.question3WantsContact,
    createdAt: now,
    created_at: now
  };

  const casePayload = {
    id: caseId,
    businessId: params.businessId,
    business_id: params.businessId,
    customerId: customerId,
    customer_id: customerId,
    reviewId: params.reviewId,
    review_id: params.reviewId,
    feedbackId: fbId,
    feedback_id: fbId,
    customerName: params.customerName,
    customer_name: params.customerName,
    customerPhone: params.customerPhone,
    customer_phone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    customer_email: params.customerEmail || '',
    rating: params.rating,
    status: 'novo',
    notes: params.question1,
    assignedTo: '',
    assigned_to: '',
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };

  const tasks: Promise<any>[] = [];

  // 2. Server API write
  tasks.push(
    Promise.allSettled([
      apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbPayload)
      }),
      apiFetch('/api/recovery_cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(casePayload)
      })
    ])
  );

  // 3. Supabase Direct write
  if (isSupabaseConfigured()) {
    tasks.push(
      Promise.allSettled([
        supabase.from('feedback').insert([{
          id: fbId,
          business_id: params.businessId,
          review_id: params.reviewId,
          customer_id: customerId,
          customer_name: params.customerName,
          customer_phone: params.customerPhone,
          customer_email: params.customerEmail || '',
          rating: params.rating,
          question1: params.question1,
          question2: params.question2,
          question3_wants_contact: params.question3WantsContact,
          created_at: now
        }]),
        supabase.from('recovery_cases').insert([{
          id: caseId,
          business_id: params.businessId,
          customer_id: customerId,
          review_id: params.reviewId,
          feedback_id: fbId,
          customer_name: params.customerName,
          customer_phone: params.customerPhone,
          customer_email: params.customerEmail || '',
          rating: params.rating,
          status: 'novo',
          notes: params.question1,
          assigned_to: '',
          created_at: now,
          updated_at: now
        }])
      ])
    );
  }

  await Promise.allSettled(tasks);

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  return { feedbackId: fbId, caseId, customerId };
}

// ==========================================
// CUSTOMERS (CRM - RESILIENT SYNC)
// ==========================================
export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  const fetchAllSources = async () => {
    const custMap = new Map<string, Customer>();

    // 1. Local Cache
    try {
      const cached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
      for (const c of cached) {
        if (isMatchingBusiness(c.businessId, businessId)) {
          custMap.set(c.id, c);
        }
      }
    } catch {}

    // 2. Server API
    try {
      const url = businessId ? `/api/customers?businessId=${encodeURIComponent(businessId)}` : '/api/customers';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const c of data) {
            const biz = c.businessId || c.business_id || '';
            if (isMatchingBusiness(biz, businessId)) {
              custMap.set(c.id, {
                id: c.id,
                businessId: biz,
                name: c.name || 'Cliente',
                phone: c.phone || '',
                email: c.email || '',
                reviewsCount: Number(c.reviewsCount || c.reviews_count || 1),
                lastReviewAt: c.lastReviewAt || c.last_review_at || new Date().toISOString(),
                avgRating: Number(c.avgRating || c.avg_rating || 5),
                status: c.status || 'active',
                internalNotes: c.internalNotes || c.internal_notes || '',
                lastInteractionAt: c.lastInteractionAt || c.last_interaction_at || new Date().toISOString(),
                createdAt: c.createdAt || c.created_at || new Date().toISOString(),
                updatedAt: c.updatedAt || c.updated_at || new Date().toISOString()
              });
            }
          }
        }
      }
    } catch (e) {}

    // 3. Supabase Direct
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('customers').select('*');
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.biz_${businessId}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          for (const c of data) {
            const biz = c.business_id || c.businessId || '';
            if (isMatchingBusiness(biz, businessId)) {
              custMap.set(c.id, {
                id: c.id,
                businessId: biz,
                name: c.name || 'Cliente',
                phone: c.phone || '',
                email: c.email || '',
                reviewsCount: Number(c.reviews_count || c.reviewsCount || 1),
                lastReviewAt: c.last_review_at || c.lastReviewAt || new Date().toISOString(),
                avgRating: Number(c.avg_rating || c.avgRating || 5),
                status: c.status || 'active',
                internalNotes: c.internal_notes || c.internalNotes || '',
                lastInteractionAt: c.last_interaction_at || c.lastInteractionAt || new Date().toISOString(),
                createdAt: c.created_at || c.createdAt || new Date().toISOString(),
                updatedAt: c.updated_at || c.updatedAt || new Date().toISOString()
              });
            }
          }
        }
      } catch (e) {}
    }

    const merged = Array.from(custMap.values());
    merged.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());

    try {
      const allCached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
      const allMap = new Map<string, Customer>();
      for (const c of allCached) allMap.set(c.id, c);
      for (const c of merged) allMap.set(c.id, c);
      setCached(LOCAL_STORAGE_KEY_CUSTOMERS, Array.from(allMap.values()));
    } catch {}

    callback(merged);
  };

  fetchAllSources();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `realtime_customers_${Math.random().toString(36).substring(2, 6)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchAllSources();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchAllSources();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);
  }

  const interval = setInterval(fetchAllSources, 3000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
    }
    clearInterval(interval);
  };
}

export async function upsertCustomerByPhone(params: {
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  rating: number;
  status: Customer['status'];
  internalNotes?: string;
}): Promise<string> {
  const targetId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const customerRecord: Customer = {
    id: targetId,
    businessId: params.businessId,
    name: params.name || 'Cliente',
    phone: params.phone || '',
    email: params.email || '',
    reviewsCount: 1,
    lastReviewAt: now,
    avgRating: params.rating,
    status: params.status || 'active',
    internalNotes: params.internalNotes || '',
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now
  };

  // 1. Instant local storage update
  try {
    const cached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
    const matchIdx = cached.findIndex(
      (c) => (c.phone && params.phone && c.phone === params.phone && isMatchingBusiness(c.businessId, params.businessId))
    );
    if (matchIdx !== -1) {
      cached[matchIdx] = {
        ...cached[matchIdx],
        name: params.name || cached[matchIdx].name,
        reviewsCount: (cached[matchIdx].reviewsCount || 1) + 1,
        lastReviewAt: now,
        avgRating: Math.round(((cached[matchIdx].avgRating || 5) + params.rating) / 2 * 10) / 10,
        status: params.status,
        internalNotes: params.internalNotes || cached[matchIdx].internalNotes,
        updatedAt: now
      };
      setCached(LOCAL_STORAGE_KEY_CUSTOMERS, cached);
    } else {
      setCached(LOCAL_STORAGE_KEY_CUSTOMERS, [customerRecord, ...cached]);
    }
  } catch {}

  notifyDataChanged();

  const payload = {
    id: targetId,
    businessId: params.businessId,
    business_id: params.businessId,
    name: params.name || 'Cliente',
    phone: params.phone || '',
    email: params.email || '',
    reviewsCount: 1,
    reviews_count: 1,
    lastReviewAt: now,
    last_review_at: now,
    avgRating: params.rating,
    avg_rating: params.rating,
    status: params.status || 'active',
    internalNotes: params.internalNotes || '',
    internal_notes: params.internalNotes || '',
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };

  // 2. Supabase upsert
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('customers').upsert([{
        id: targetId,
        business_id: params.businessId,
        name: params.name || 'Cliente',
        phone: params.phone || '',
        email: params.email || '',
        reviews_count: 1,
        last_review_at: now,
        avg_rating: params.rating,
        status: params.status || 'active',
        internal_notes: params.internalNotes || '',
        created_at: now,
        updated_at: now
      }]);
    } catch (e) {
      console.warn('Supabase customer upsert warning:', e);
    }
  }

  // 3. API POST
  try {
    await apiFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('API customer upsert error:', err);
  }

  notifyDataChanged();
  return targetId;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  try {
    const cached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
    setCached(
      LOCAL_STORAGE_KEY_CUSTOMERS,
      cached.map((c) => (c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c))
    );
  } catch {}

  if (isSupabaseConfigured()) {
    try {
      const dbPayload: any = { updated_at: new Date().toISOString() };
      if (data.name !== undefined) dbPayload.name = data.name;
      if (data.phone !== undefined) dbPayload.phone = data.phone;
      if (data.email !== undefined) dbPayload.email = data.email;
      if (data.status !== undefined) dbPayload.status = data.status;
      if (data.internalNotes !== undefined) dbPayload.internal_notes = data.internalNotes;

      await supabase.from('customers').update(dbPayload).eq('id', id);
    } catch (e) {}
  }

  notifyDataChanged();
}

// ==========================================
// RECOVERY CASES (RESILIENT SYNC)
// ==========================================
export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  const fetchAllSources = async () => {
    const caseMap = new Map<string, RecoveryCase>();

    // 1. Local Cache
    try {
      const cached = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
      for (const c of cached) {
        if (isMatchingBusiness(c.businessId, businessId)) {
          caseMap.set(c.id, c);
        }
      }
    } catch {}

    // 2. Server API
    try {
      const url = businessId ? `/api/recovery_cases?businessId=${encodeURIComponent(businessId)}` : '/api/recovery_cases';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const c of data) {
            const biz = c.businessId || c.business_id || '';
            if (isMatchingBusiness(biz, businessId)) {
              caseMap.set(c.id, {
                id: c.id,
                businessId: biz,
                customerId: c.customerId || c.customer_id || '',
                reviewId: c.reviewId || c.review_id || '',
                feedbackId: c.feedbackId || c.feedback_id || '',
                customerName: c.customerName || c.customer_name || 'Cliente',
                customerPhone: c.customerPhone || c.customer_phone || '',
                customerEmail: c.customerEmail || c.customer_email || '',
                rating: Number(c.rating || 1),
                status: c.status || 'novo',
                notes: c.notes || '',
                assignedTo: c.assignedTo || c.assigned_to || '',
                createdAt: c.createdAt || c.created_at || new Date().toISOString(),
                updatedAt: c.updatedAt || c.updated_at || new Date().toISOString()
              });
            }
          }
        }
      }
    } catch (e) {}

    // 3. Supabase Direct
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('recovery_cases').select('*');
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},business_id.eq.biz_${businessId}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          for (const c of data) {
            const biz = c.business_id || c.businessId || '';
            if (isMatchingBusiness(biz, businessId)) {
              caseMap.set(c.id, {
                id: c.id,
                businessId: biz,
                customerId: c.customer_id || c.customerId || '',
                reviewId: c.review_id || c.reviewId || '',
                feedbackId: c.feedback_id || c.feedbackId || '',
                customerName: c.customer_name || c.customerName || '',
                customerPhone: c.customer_phone || c.customerPhone || '',
                customerEmail: c.customer_email || c.customerEmail || '',
                rating: Number(c.rating || 1),
                status: c.status || 'novo',
                notes: c.notes || '',
                assignedTo: c.assigned_to || c.assignedTo || '',
                createdAt: c.created_at || c.createdAt || new Date().toISOString(),
                updatedAt: c.updated_at || c.updatedAt || new Date().toISOString()
              });
            }
          }
        }
      } catch (e) {}
    }

    const merged = Array.from(caseMap.values());
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    try {
      const allCached = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
      const allMap = new Map<string, RecoveryCase>();
      for (const c of allCached) allMap.set(c.id, c);
      for (const c of merged) allMap.set(c.id, c);
      setCached(LOCAL_STORAGE_KEY_CASES, Array.from(allMap.values()));
    } catch {}

    callback(merged);
  };

  fetchAllSources();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `realtime_recovery_cases_${Math.random().toString(36).substring(2, 6)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recovery_cases' }, () => {
        fetchAllSources();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchAllSources();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);
  }

  const interval = setInterval(fetchAllSources, 3000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
    }
    clearInterval(interval);
  };
}

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  try {
    const cached = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
    setCached(
      LOCAL_STORAGE_KEY_CASES,
      cached.map((c) => (c.id === caseId ? { ...c, status, ...(notes ? { notes } : {}), updatedAt: new Date().toISOString() } : c))
    );
  } catch {}

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('recovery_cases').update({
        status,
        ...(notes ? { notes } : {}),
        updated_at: new Date().toISOString()
      }).eq('id', caseId);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/recovery_cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes })
    });
  } catch (err) {}

  if (customerId) {
    let customerStatus: Customer['status'] = 'in_recovery';
    if (status === 'cliente_recuperado') customerStatus = 'recovered';
    if (status === 'resolvido') customerStatus = 'active';
    updateCustomer(customerId, { status: customerStatus }).catch(() => {});
  }

  notifyDataChanged();
}

// ==========================================
// INTERACTIONS
// ==========================================
export function subscribeInteractions(businessId: string | null, callback: (interactions: Interaction[]) => void) {
  callback([]);
  return () => {};
}

export async function addInteraction(
  data: Omit<Interaction, 'id' | 'createdAt'>
): Promise<string> {
  const targetId = `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  return targetId;
}

// ==========================================
// PLANS & PLATFORM SETTINGS
// ==========================================
export async function getPlans(): Promise<Plan[]> {
  return [];
}

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  return null;
}

export async function updatePlatformSettings(settings: Partial<PlatformSettings>): Promise<void> {
  notifyDataChanged();
}

export async function savePlatformSettings(settings: Partial<PlatformSettings>): Promise<void> {
  return updatePlatformSettings(settings);
}

export async function savePlan(plan: Plan): Promise<void> {
  notifyDataChanged();
}
