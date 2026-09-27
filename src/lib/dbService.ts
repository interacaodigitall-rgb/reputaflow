import {
  Business,
  Customer,
  Review,
  Feedback,
  RecoveryCase,
  RecoveryCaseStatus,
  Interaction,
  Plan,
  PlatformSettings
} from '../types';
import {
  REGISTERED_BUSINESSES,
  INITIAL_REVIEWS,
  INITIAL_FEEDBACK,
  INITIAL_CUSTOMERS,
  INITIAL_RECOVERY_CASES
} from './initialData';
import { supabase, isSupabaseConfigured, uploadToSupabaseStorage, uploadBusinessLogo } from './supabase';

// ==========================================
// PURGE LEGACY LOCALSTORAGE ON BOOT (MANDATORY RULE #2)
// ==========================================
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('reputaflow_reviews');
    localStorage.removeItem('reviews');
    localStorage.removeItem('reputaflow_cache_reviews');
    localStorage.removeItem('reputaflow_cache_feedback');
    localStorage.removeItem('reputaflow_cache_recovery');
    localStorage.removeItem('reputaflow_cache_customers');
  } catch (e) {}
}

// ==========================================
// CENTRALIZED NO-CACHE HTTP CLIENT
// ==========================================
async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.includes('?') ? `${endpoint}&_t=${Date.now()}` : `${endpoint}?_t=${Date.now()}`;
  return fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...(options.headers || {})
    }
  });
}

// ==========================================
// IMAGE UPLOAD SERVICE (SUPABASE STORAGE)
// ==========================================
export async function uploadImage(file: File, businessId?: string): Promise<string> {
  const currentMerchantId = businessId || 'biz_mrnavalha';
  const publicUrl = await uploadBusinessLogo(file, currentMerchantId);

  // Sincroniza cache local e notifica componentes
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
// LOCAL STORAGE CACHE HELPERS (BUSINESS ONLY)
// ==========================================
const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_cache_businesses';

function getCached<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setCached<T>(key: string, data: T): void {
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
    const list = await getAllBusinesses();
    callback(list);
  };
  fetchAll();

  if (isSupabaseConfigured()) {
    const channelName = `sub_businesses_${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
        fetchAll();
      })
      .subscribe();

    const handleSync = () => fetchAll();
    if (typeof window !== 'undefined') {
      window.addEventListener('reputaflow_live_sync', handleSync);
    }

    return () => {
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('reputaflow_live_sync', handleSync);
      }
    };
  }

  const handleSync = () => fetchAll();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSync);
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSync);
    }
  };
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const all = await getAllBusinesses();
  return all.find((b) => b.slug === slug || b.id === slug) || null;
}

export function getLocalBusinesses(): Business[] {
  return getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
}

export async function getAllBusinesses(): Promise<Business[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from('businesses').select('*');
      if (!error && data && data.length > 0) {
        const mapped: Business[] = data.map((b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          category: b.category,
          phone: b.phone,
          email: b.email,
          address: b.address,
          logoUrl: b.logo_url || b.logoUrl,
          googleReviewUrl: b.google_review_url || b.googleReviewUrl,
          status: b.status || 'active',
          planId: b.plan_id || b.planId || 'pro',
          ownerId: b.owner_id || b.ownerId || 'admin',
          createdAt: b.created_at || b.createdAt || new Date().toISOString(),
          currency: b.currency || 'EUR'
        }));
        setCached(LOCAL_STORAGE_KEY_BIZ, mapped);
        return mapped;
      }
    } catch (e) {}
  }

  try {
    const res = await apiFetch('/api/businesses');
    if (res.ok) {
      const data: Business[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setCached(LOCAL_STORAGE_KEY_BIZ, data);
        return data;
      }
    }
  } catch (e) {}

  return getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
}

export async function createBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business> {
  const id = `biz_${normalizeKey(data.name || 'loja')}_${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const payload: Business = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('businesses').insert([{
        id,
        name: data.name,
        slug: data.slug || id,
        category: data.category,
        phone: data.phone,
        email: data.email,
        address: data.address,
        logo_url: data.logoUrl,
        google_review_url: data.googleReviewUrl,
        status: data.status || 'active',
        plan_id: data.planId || 'pro',
        owner_id: data.ownerId || 'admin',
        currency: data.currency || 'EUR',
        created_at: now,
        updated_at: now
      }]);
    } catch (e) {}
  }

  try {
    await apiFetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  setCached(LOCAL_STORAGE_KEY_BIZ, [payload, ...list]);
  notifyDataChanged();
  return payload;
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const now = new Date().toISOString();
      const dbPayload: any = {
        id,
        updated_at: now
      };
      if (data.name !== undefined) dbPayload.name = data.name;
      if (data.slug !== undefined) dbPayload.slug = data.slug;
      if (data.category !== undefined) dbPayload.category = data.category;
      if (data.phone !== undefined) dbPayload.phone = data.phone;
      if (data.email !== undefined) dbPayload.email = data.email;
      if (data.address !== undefined) dbPayload.address = data.address;
      if (data.logoUrl !== undefined) {
        dbPayload.logo_url = data.logoUrl;
      }
      if (data.googleReviewUrl !== undefined) {
        dbPayload.google_review_url = data.googleReviewUrl;
      }
      if (data.status !== undefined) dbPayload.status = data.status;
      if (data.planId !== undefined) {
        dbPayload.plan_id = data.planId;
      }
      if (data.ownerId !== undefined) {
        dbPayload.owner_id = data.ownerId;
      }
      if (data.currency !== undefined) dbPayload.currency = data.currency;

      const { error } = await supabase.from('businesses').upsert([dbPayload], { onConflict: 'id' });
      if (error) {
        console.warn('Supabase update business error:', error);
      }
    } catch (e) {
      console.warn('Supabase update business exception:', e);
    }
  }

  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {}

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_BIZ);
    } catch (e) {}
  }

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  const updatedList = list.map((b) => (b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b));
  setCached(LOCAL_STORAGE_KEY_BIZ, updatedList);
  notifyDataChanged();
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
}

// ==========================================
// REVIEWS (SUPABASE DIRECT QUERY & REALTIME - STRICT MANDATORY RULES)
// ==========================================
export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const fetchFromSupabase = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('reviews').select('*');
        if (businessId) {
          query = query.eq('business_id', businessId);
        }
        const { data, error } = await query;
        if (!error && data) {
          const mapped: Review[] = data.map((r: any) => ({
            id: r.id,
            businessId: r.business_id || r.merchant_id || '',
            rating: Number(r.rating || 5),
            customerName: r.customer_name || 'Cliente',
            customerPhone: r.customer_phone || '',
            customerEmail: r.customer_email || '',
            channel: (r.channel || 'qr').toLowerCase() as any,
            createdAt: r.created_at || new Date().toISOString()
          }));
          mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(mapped);
          return;
        } else if (error) {
          console.warn('[Supabase Reviews] Fetch error:', error.message);
        }
      } catch (err) {
        console.warn('Supabase reviews fetch error:', err);
      }
    }

    try {
      const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Review[] = await res.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((r) => isMatchingBusiness(r.businessId, businessId));
          filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(filtered);
          return;
        }
      }
    } catch (e) {}

    // RULE #1: NEVER return mock data or legacy localStorage when empty! Return [] directly!
    callback([]);
  };

  fetchFromSupabase();

  let channel: any = null;
  // RULE #3: Realtime listener on Supabase channel listening to postgres_changes + Realtime Broadcast
  if (isSupabaseConfigured()) {
    const channelName = `crm_reviews_channel_${businessId || 'all'}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, (payload) => {
        console.log('[Supabase Realtime] Reviews postgres_changes event:', payload.eventType);
        fetchFromSupabase();
      })
      .on('broadcast', { event: 'review_created' }, () => {
        console.log('[Supabase Realtime] Broadcast review_created received');
        fetchFromSupabase();
      })
      .on('broadcast', { event: 'review_deleted' }, () => {
        console.log('[Supabase Realtime] Broadcast review_deleted received');
        fetchFromSupabase();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] Subscribed to reviews channel:', channelName);
        }
      });
  }

  const handleSyncEvent = () => fetchFromSupabase();
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchFromSupabase();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
    window.addEventListener('reputaflow_reviews_updated', handleSyncEvent);
    window.addEventListener('focus', handleSyncEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  const interval = setInterval(fetchFromSupabase, 3000);

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
      window.removeEventListener('reputaflow_reviews_updated', handleSyncEvent);
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

  // Strict valid snake_case DB columns matching PostgreSQL schema
  const dbPayload = {
    id: targetId,
    business_id: data.businessId,
    rating: Number(data.rating),
    customer_name: data.customerName?.trim() || 'Cliente',
    customer_phone: data.customerPhone?.trim() || null,
    customer_email: data.customerEmail?.trim() || null,
    channel: (data.channel || 'qr').toLowerCase(),
    created_at: now
  };

  if (isSupabaseConfigured()) {
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('reviews')
        .insert([dbPayload])
        .select();

      if (insertError) {
        console.error('[Supabase Review Insert] Erro detalhado:', insertError);
        throw new Error(`Falha ao registrar no Supabase: ${insertError.message}`);
      }

      console.log('[Supabase Review Insert] Gravado com sucesso no Supabase:', inserted);

      // Notifica canais Realtime para sincronização instantânea em outros dispositivos
      try {
        const syncChannel = supabase.channel(`crm_reviews_channel_${data.businessId || 'all'}`);
        syncChannel.send({
          type: 'broadcast',
          event: 'review_created',
          payload: dbPayload
        }).catch(() => {});
      } catch (bcErr) {
        console.warn('Realtime broadcast warning:', bcErr);
      }
    } catch (err: any) {
      console.error('[Supabase Review Insert] Exceção capturada:', err);
      // Fallback local API
      try {
        await apiFetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbPayload)
        });
      } catch (apiErr) {
        console.warn('API fallback review error:', apiErr);
      }
    }
  } else {
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbPayload)
      });
    } catch (err) {}
  }

  if (data.customerName || data.customerPhone) {
    upsertCustomerByPhone({
      businessId: data.businessId,
      name: data.customerName || 'Cliente',
      phone: data.customerPhone || '',
      email: data.customerEmail || '',
      rating: data.rating,
      status: data.rating >= 4 ? 'active' : 'in_recovery',
      internalNotes: `Avaliação de ${data.rating} estrelas via ${data.channel || 'QR'}`
    }).catch(() => {});
  }

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_reviews_updated'));
  }

  return { reviewId: targetId };
}

export async function deleteReview(reviewId: string): Promise<void> {
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

  try {
    const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
    await apiFetch(url, { method: 'DELETE' });
  } catch (err) {}

  notifyDataChanged();
}

// ==========================================
// FEEDBACK & RECOVERY
// ==========================================
export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  const fetchFromSupabase = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('feedback').select('*');
        if (businessId) {
          query = query.eq('business_id', businessId);
        }
        const { data, error } = await query;
        if (!error && data) {
          const mapped: Feedback[] = data.map((f: any) => ({
            id: f.id,
            businessId: f.business_id || '',
            reviewId: f.review_id || '',
            customerId: f.customer_id || '',
            customerName: f.customer_name || 'Cliente',
            customerPhone: f.customer_phone || '',
            customerEmail: f.customer_email || '',
            rating: Number(f.rating || 1),
            question1: f.question1 || '',
            question2: f.question2 || '',
            question3WantsContact: Boolean(f.question3_wants_contact ?? true),
            createdAt: f.created_at || new Date().toISOString()
          }));
          mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(mapped);
          return;
        }
      } catch (err) {
        console.warn('Supabase feedback fetch error:', err);
      }
    }

    try {
      const url = businessId ? `/api/feedback?businessId=${encodeURIComponent(businessId)}` : '/api/feedback';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Feedback[] = await res.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((f) => isMatchingBusiness(f.businessId, businessId));
          filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(filtered);
          return;
        }
      }
    } catch (e) {}

    callback([]);
  };

  fetchFromSupabase();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `realtime_feedback_${businessId || 'all'}_${Math.random().toString(36).substring(2, 8)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, () => {
        fetchFromSupabase();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchFromSupabase();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
    window.addEventListener('reputaflow_reviews_updated', handleSyncEvent);
  }

  const interval = setInterval(fetchFromSupabase, 3000);

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
      window.removeEventListener('reputaflow_reviews_updated', handleSyncEvent);
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

  const fbPayload = {
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
  };

  const casePayload = {
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
  };

  if (isSupabaseConfigured()) {
    try {
      await Promise.all([
        supabase.from('feedback').insert([fbPayload]),
        supabase.from('recovery_cases').insert([casePayload])
      ]);
    } catch (e) {}
  }

  notifyDataChanged();
  return { feedbackId: fbId, caseId, customerId };
}

// ==========================================
// CUSTOMERS (CRM)
// ==========================================
export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  const fetchFromSupabase = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('customers').select('*');
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},businessId.eq.${businessId}`);
        }
        const { data, error } = await query;
        if (!error && data) {
          const mapped: Customer[] = data.map((c: any) => ({
            id: c.id,
            businessId: c.business_id || c.businessId || '',
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
          }));
          mapped.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    try {
      const url = businessId ? `/api/customers?businessId=${encodeURIComponent(businessId)}` : '/api/customers';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Customer[] = await res.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((c) => isMatchingBusiness(c.businessId, businessId));
          filtered.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());
          callback(filtered);
          return;
        }
      }
    } catch (e) {}

    callback([]);
  };

  fetchFromSupabase();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `realtime_customers_${Math.random().toString(36).substring(2, 8)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchFromSupabase();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchFromSupabase();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
  }

  const interval = setInterval(fetchFromSupabase, 3000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
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

  const payload = {
    id: targetId,
    business_id: params.businessId,
    businessId: params.businessId,
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
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('customers').upsert([payload]);
    } catch (e) {}
  }

  notifyDataChanged();
  return targetId;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
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
// RECOVERY CASES
// ==========================================
export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  const fetchFromSupabase = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('recovery_cases').select('*');
        if (businessId) {
          query = query.or(`business_id.eq.${businessId},businessId.eq.${businessId}`);
        }
        const { data, error } = await query;
        if (!error && data) {
          const mapped: RecoveryCase[] = data.map((c: any) => ({
            id: c.id,
            businessId: c.business_id || c.businessId || '',
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
          }));
          mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    try {
      const url = businessId ? `/api/recovery-cases?businessId=${encodeURIComponent(businessId)}` : '/api/recovery-cases';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: RecoveryCase[] = await res.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((c) => isMatchingBusiness(c.businessId, businessId));
          filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(filtered);
          return;
        }
      }
    } catch (e) {}

    callback([]);
  };

  fetchFromSupabase();

  let channel: any = null;
  if (isSupabaseConfigured()) {
    const channelName = `realtime_recovery_cases_${Math.random().toString(36).substring(2, 8)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recovery_cases' }, () => {
        fetchFromSupabase();
      })
      .subscribe();
  }

  const handleSyncEvent = () => fetchFromSupabase();
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleSyncEvent);
  }

  const interval = setInterval(fetchFromSupabase, 3000);

  return () => {
    if (channel) supabase.removeChannel(channel);
    if (typeof window !== 'undefined') window.removeEventListener('reputaflow_live_sync', handleSyncEvent);
    clearInterval(interval);
  };
}

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('recovery_cases').update({
        status,
        ...(notes ? { notes } : {}),
        updated_at: new Date().toISOString()
      }).eq('id', caseId);
    } catch (e) {}
  }

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
