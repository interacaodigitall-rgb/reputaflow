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
import { supabase, isSupabaseConfigured, uploadToSupabaseStorage } from './supabase';

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
// BULLETPROOF IMAGE UPLOAD SERVICE (SUPABASE STORAGE)
// ==========================================
export async function uploadImage(file: File): Promise<string> {
  if (isSupabaseConfigured()) {
    try {
      const url = await uploadToSupabaseStorage(file);
      if (url) return url;
    } catch (err) {
      console.warn('Supabase Storage upload error:', err);
    }
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
          }

          const base64Data = canvas.toDataURL('image/jpeg', 0.85);

          try {
            const res = await apiFetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image: base64Data,
                filename: file.name
              })
            });

            if (res.ok) {
              const data = await res.json();
              if (data.url) {
                resolve(data.url);
                return;
              }
            }
          } catch (netErr) {}

          resolve(base64Data);
        } catch {
          resolve(e.target?.result as string || '');
        }
      };
      img.onerror = () => {
        resolve(e.target?.result as string || '');
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
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
const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_cache_businesses';
const LOCAL_STORAGE_KEY_REVIEWS = 'reputaflow_cache_reviews';
const LOCAL_STORAGE_KEY_FEEDBACK = 'reputaflow_cache_feedback';
const LOCAL_STORAGE_KEY_CUSTOMERS = 'reputaflow_cache_customers';
const LOCAL_STORAGE_KEY_RECOVERY = 'reputaflow_cache_recovery';
const LOCAL_STORAGE_KEY_INTERACTIONS = 'reputaflow_cache_interactions';

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

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`)
        .limit(1);

      if (!error && data && data.length > 0) {
        const b = data[0];
        return {
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
        };
      }
    } catch (e) {}
  }

  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(cleanSlug)}`);
    if (res.ok) {
      const biz: Business = await res.json();
      if (biz) return biz;
    }
  } catch (e) {}

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  const found = list.find((b) => b && (b.slug === cleanSlug || b.id === cleanSlug));
  return found || null;
}

export async function getBusinessById(id: string): Promise<Business | null> {
  return getBusinessBySlug(id);
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  callback(getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES));

  const fetchLatest = async () => {
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
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    try {
      const res = await apiFetch('/api/businesses');
      if (res.ok) {
        const data: Business[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCached(LOCAL_STORAGE_KEY_BIZ, data);
          callback(data);
        }
      }
    } catch (e) {}
  };

  fetchLatest();

  if (isSupabaseConfigured()) {
    const channelName = `sub_biz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
        fetchLatest();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const interval = setInterval(fetchLatest, 3000);
  return () => clearInterval(interval);
}

export async function createBusiness(data: Omit<Business, 'id'>, customId?: string): Promise<string> {
  const targetId = customId || `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const payload = { ...data, id: targetId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('businesses').insert([{
        id: targetId,
        name: data.name,
        slug: data.slug,
        category: data.category || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        logo_url: data.logoUrl || '',
        google_review_url: data.googleReviewUrl || '',
        status: data.status || 'active',
        plan_id: data.planId || 'pro',
        owner_id: data.ownerId || 'admin',
        currency: data.currency || 'EUR'
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
  return targetId;
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const dbPayload: any = {};
      if (data.name !== undefined) dbPayload.name = data.name;
      if (data.slug !== undefined) dbPayload.slug = data.slug;
      if (data.category !== undefined) dbPayload.category = data.category;
      if (data.phone !== undefined) dbPayload.phone = data.phone;
      if (data.email !== undefined) dbPayload.email = data.email;
      if (data.address !== undefined) dbPayload.address = data.address;
      if (data.logoUrl !== undefined) dbPayload.logo_url = data.logoUrl;
      if (data.googleReviewUrl !== undefined) dbPayload.google_review_url = data.googleReviewUrl;
      if (data.currency !== undefined) dbPayload.currency = data.currency;

      await supabase.from('businesses').update(dbPayload).eq('id', id);
    } catch (e) {}
  }

  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {}

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
// REVIEWS (SUPABASE DIRECT QUERY & REALTIME)
// ==========================================
export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const fetchFromSupabase = async () => {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('reviews').select('*');
        if (businessId) {
          query = query.or(`merchant_id.eq.${businessId},business_id.eq.${businessId},businessId.eq.${businessId}`);
        }
        const { data, error } = await query;
        if (!error && data) {
          const mapped: Review[] = data.map((r: any) => ({
            id: r.id,
            businessId: r.merchant_id || r.business_id || r.businessId || '',
            rating: Number(r.rating || 5),
            customerName: r.customer_name || r.customerName || 'Cliente',
            customerPhone: r.customer_phone || r.customerPhone || '',
            customerEmail: r.customer_email || r.customerEmail || '',
            channel: (r.channel || 'qr').toLowerCase() as any,
            createdAt: r.created_at || r.createdAt || new Date().toISOString()
          }));
          mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setCached(LOCAL_STORAGE_KEY_REVIEWS, mapped);
          callback(mapped);
          return;
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
          setCached(LOCAL_STORAGE_KEY_REVIEWS, data);
          const filtered = data.filter((r) => isMatchingBusiness(r.businessId, businessId));
          filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(filtered);
          return;
        }
      }
    } catch (e) {}

    const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, INITIAL_REVIEWS);
    const filtered = cached.filter((r) => isMatchingBusiness(r.businessId, businessId));
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(filtered);
  };

  fetchFromSupabase();

  if (isSupabaseConfigured()) {
    const channelName = `sub_reviews_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        fetchFromSupabase();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const interval = setInterval(fetchFromSupabase, 3000);
  return () => clearInterval(interval);
}

export async function submitReview(
  data: Omit<Review, 'id' | 'createdAt'>
): Promise<{ reviewId: string }> {
  const targetId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const payload: Review = {
    id: targetId,
    businessId: data.businessId,
    rating: data.rating,
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    customerEmail: data.customerEmail || '',
    channel: data.channel || 'qr',
    createdAt: now
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('reviews').insert([{
        id: targetId,
        merchant_id: data.businessId,
        business_id: data.businessId,
        businessId: data.businessId,
        rating: data.rating,
        customer_name: data.customerName || '',
        customer_phone: data.customerPhone || '',
        customer_email: data.customerEmail || '',
        channel: data.channel || 'qr',
        created_at: now
      }]);
    } catch (e) {}
  }

  try {
    await apiFetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {}

  const list = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, INITIAL_REVIEWS);
  setCached(LOCAL_STORAGE_KEY_REVIEWS, [payload, ...list]);

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
    } catch (e) {
      console.warn('Supabase delete review error:', e);
    }
  }

  try {
    await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE'
    });
  } catch (err) {}

  const cachedReviews = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, INITIAL_REVIEWS);
  const updatedReviews = cachedReviews.filter((r) => r.id !== reviewId);
  setCached(LOCAL_STORAGE_KEY_REVIEWS, updatedReviews);

  const cachedFeedback = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, INITIAL_FEEDBACK);
  const updatedFeedback = cachedFeedback.filter((f) => f.reviewId !== reviewId);
  setCached(LOCAL_STORAGE_KEY_FEEDBACK, updatedFeedback);

  const cachedCases = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES);
  const updatedCases = cachedCases.filter((c) => c.reviewId !== reviewId);
  setCached(LOCAL_STORAGE_KEY_RECOVERY, updatedCases);

  notifyDataChanged();
}

export async function clearAllReviews(businessId?: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      if (businessId) {
        await Promise.all([
          supabase.from('reviews').delete().or(`merchant_id.eq.${businessId},business_id.eq.${businessId},businessId.eq.${businessId}`),
          supabase.from('feedback').delete().or(`business_id.eq.${businessId},businessId.eq.${businessId}`),
          supabase.from('recovery_cases').delete().or(`business_id.eq.${businessId},businessId.eq.${businessId}`)
        ]);
      } else {
        await Promise.all([
          supabase.from('reviews').delete().gte('rating', 0),
          supabase.from('feedback').delete().gte('rating', 0),
          supabase.from('recovery_cases').delete().gte('rating', 0)
        ]);
      }
    } catch (e) {
      console.warn('Supabase clear all reviews error:', e);
    }
  }

  try {
    const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
    await apiFetch(url, { method: 'DELETE' });
  } catch (err) {}

  if (businessId) {
    const cachedReviews = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, INITIAL_REVIEWS);
    setCached(LOCAL_STORAGE_KEY_REVIEWS, cachedReviews.filter((r) => !isMatchingBusiness(r.businessId, businessId)));

    const cachedFeedback = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, INITIAL_FEEDBACK);
    setCached(LOCAL_STORAGE_KEY_FEEDBACK, cachedFeedback.filter((f) => !isMatchingBusiness(f.businessId, businessId)));

    const cachedCases = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES);
    setCached(LOCAL_STORAGE_KEY_RECOVERY, cachedCases.filter((c) => !isMatchingBusiness(c.businessId, businessId)));
  } else {
    setCached(LOCAL_STORAGE_KEY_REVIEWS, []);
    setCached(LOCAL_STORAGE_KEY_FEEDBACK, []);
    setCached(LOCAL_STORAGE_KEY_RECOVERY, []);
  }

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
          query = query.or(`business_id.eq.${businessId},businessId.eq.${businessId}`);
        }
        const { data, error } = await query;
        if (!error && data) {
          const mapped: Feedback[] = data.map((f: any) => ({
            id: f.id,
            businessId: f.business_id || f.businessId || '',
            reviewId: f.review_id || f.reviewId || '',
            customerId: f.customer_id || f.customerId || '',
            customerName: f.customer_name || f.customerName || '',
            customerPhone: f.customer_phone || f.customerPhone || '',
            customerEmail: f.customer_email || f.customerEmail || '',
            rating: Number(f.rating || 1),
            question1: f.question1 || '',
            question2: f.question2 || '',
            question3WantsContact: Boolean(f.question3_wants_contact || f.question3WantsContact),
            createdAt: f.created_at || f.createdAt || new Date().toISOString()
          }));
          mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setCached(LOCAL_STORAGE_KEY_FEEDBACK, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    const cached = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, INITIAL_FEEDBACK);
    const filtered = cached.filter((f) => isMatchingBusiness(f.businessId, businessId));
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(filtered);
  };

  fetchFromSupabase();

  if (isSupabaseConfigured()) {
    const channelName = `sub_feedback_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, () => {
        fetchFromSupabase();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const interval = setInterval(fetchFromSupabase, 3000);
  return () => clearInterval(interval);
}

export async function submitFeedbackAndRecovery(params: {
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

  const fbList = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, INITIAL_FEEDBACK);
  setCached(LOCAL_STORAGE_KEY_FEEDBACK, [fbPayload as any, ...fbList]);

  const caseList = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES);
  setCached(LOCAL_STORAGE_KEY_RECOVERY, [casePayload as any, ...caseList]);

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
          setCached(LOCAL_STORAGE_KEY_CUSTOMERS, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    const cached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, INITIAL_CUSTOMERS);
    const filtered = cached.filter((c) => isMatchingBusiness(c.businessId, businessId));
    filtered.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());
    callback(filtered);
  };

  fetchFromSupabase();

  if (isSupabaseConfigured()) {
    const channelName = `sub_customers_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchFromSupabase();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const interval = setInterval(fetchFromSupabase, 3000);
  return () => clearInterval(interval);
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

  const list = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, INITIAL_CUSTOMERS);
  setCached(LOCAL_STORAGE_KEY_CUSTOMERS, [payload as any, ...list]);
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

  const list = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, INITIAL_CUSTOMERS);
  const updated = list.map((c) => (c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c));
  setCached(LOCAL_STORAGE_KEY_CUSTOMERS, updated);
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
          setCached(LOCAL_STORAGE_KEY_RECOVERY, mapped);
          callback(mapped);
          return;
        }
      } catch (e) {}
    }

    const cached = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES);
    const filtered = cached.filter((c) => isMatchingBusiness(c.businessId, businessId));
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(filtered);
  };

  fetchFromSupabase();

  if (isSupabaseConfigured()) {
    const channelName = `sub_recovery_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recovery_cases' }, () => {
        fetchFromSupabase();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const interval = setInterval(fetchFromSupabase, 3000);
  return () => clearInterval(interval);
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

  const list = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES);
  const updated = list.map((c) => (c.id === caseId ? { ...c, status, ...(notes ? { notes } : {}), updatedAt: new Date().toISOString() } : c));
  setCached(LOCAL_STORAGE_KEY_RECOVERY, updated);

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
