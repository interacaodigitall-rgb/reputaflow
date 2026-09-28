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
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from './firebase.ts';
import { supabase, isSupabaseConfigured, uploadBusinessLogo } from './supabase.ts';

// Clean initial data - platform starts empty and is completely live-synced
export const REGISTERED_BUSINESSES: Business[] = [];

const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_businesses';
const LOCAL_STORAGE_KEY_REVIEWS = 'reputaflow_reviews_cache';
const LOCAL_STORAGE_KEY_FEEDBACK = 'reputaflow_feedback_cache';
const LOCAL_STORAGE_KEY_CASES = 'reputaflow_cases_cache';
const LOCAL_STORAGE_KEY_CUSTOMERS = 'reputaflow_customers_cache';
const LOCAL_STORAGE_KEY_PLANS = 'reputaflow_plans_cache';
const LOCAL_STORAGE_KEY_SETTINGS = 'reputaflow_settings_cache';

// Shared API fetch helper
async function apiFetch(url: string, options?: RequestInit) {
  try {
    return await fetch(url, options);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Network error' }), { status: 503 });
  }
}

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
// IMAGE UPLOAD SERVICE (SUPABASE STORAGE + SERVER API + BASE64 DATA URL)
// ==========================================
export async function uploadImage(file: File, businessId?: string): Promise<string> {
  const currentMerchantId = businessId || 'biz';
  const publicUrl = await uploadBusinessLogo(file, currentMerchantId);

  try {
    const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
    const updated = list.map((b) => (b.id === currentMerchantId ? { ...b, logoUrl: publicUrl } : b));
    setCached(LOCAL_STORAGE_KEY_BIZ, updated);
  } catch {}

  // Update in Firestore immediately if businessId provided
  if (businessId && businessId !== 'biz' && businessId !== 'new_biz') {
    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        logoUrl: publicUrl,
        updatedAt: new Date().toISOString()
      });
    } catch {}
  }

  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }

  return publicUrl;
}

// ==========================================
// BUSINESSES SERVICE (MULTI-CLOUD SYNCHRONIZED)
// ==========================================
function mapBusinessDoc(id: string, data: any): Business {
  return {
    id: id || data.id || `biz_${Date.now().toString(36)}`,
    name: data.name || '',
    slug: data.slug || normalizeKey(data.name || id),
    category: data.category || 'Comércio & Serviços',
    address: data.address || '',
    phone: data.phone || '',
    email: data.email || '',
    googleReviewUrl: data.googleReviewUrl || data.google_review_url || '',
    logoUrl: data.logoUrl || data.logo_url || '',
    bannerUrl: data.bannerUrl || data.banner_url || '',
    minRatingForGoogle: Number(data.minRatingForGoogle ?? data.min_rating_for_google ?? 4),
    qrThemeColor: data.qrThemeColor || data.qr_theme_color || '#4f46e5',
    activePlan: data.activePlan || data.active_plan || data.planId || data.plan_id || 'pro',
    planId: data.planId || data.plan_id || 'plan_pro',
    ownerId: data.ownerId || data.owner_id || '',
    currency: (data.currency as 'EUR' | 'BRL') || 'EUR',
    status: (data.status as any) || 'active',
    password: data.password || 'reputa123',
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
  };
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  let isSubscribed = true;

  const emit = (list: Business[]) => {
    if (!isSubscribed) return;
    setCached(LOCAL_STORAGE_KEY_BIZ, list);
    callback(list);
  };

  // 1. Initial cached emission for zero latency
  const cachedList = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  if (cachedList.length > 0) {
    emit(cachedList);
  }

  // 2. Real-time Firestore Listener (Cross-Device Cloud Hub)
  let unFirestore: (() => void) | null = null;
  try {
    const bizCollection = collection(db, 'businesses');
    unFirestore = onSnapshot(
      bizCollection,
      (snapshot) => {
        const firestoreList: Business[] = [];
        snapshot.forEach((d) => {
          firestoreList.push(mapBusinessDoc(d.id, d.data()));
        });

        // Sort latest first
        firestoreList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (firestoreList.length > 0) {
          emit(firestoreList);
        } else if (cachedList.length === 0) {
          emit([]);
        }
      },
      (error) => {
        console.warn('[Firestore subscribeBusinesses warning]:', error.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore setup warning]:', err);
  }

  // 3. Parallel Poller / Supabase & Server API Sync
  const fetchSecondarySources = async () => {
    let remoteList: Business[] = [];

    // Supabase check
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          remoteList = data.map((b: any) => mapBusinessDoc(b.id, b));
        }
      } catch {}
    }

    // Server API check
    if (remoteList.length === 0) {
      try {
        const res = await apiFetch('/api/businesses');
        if (res.ok) {
          const data: any[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            remoteList = data.map((b: any) => mapBusinessDoc(b.id, b));
          }
        }
      } catch {}
    }

    if (remoteList.length > 0 && isSubscribed) {
      // Sync any businesses found into Firestore as well for cross-device consistency
      remoteList.forEach((biz) => {
        try {
          setDoc(doc(db, 'businesses', biz.id), biz, { merge: true }).catch(() => {});
        } catch {}
      });
      emit(remoteList);
    }
  };

  fetchSecondarySources();
  const pollInterval = setInterval(fetchSecondarySources, 6000);

  const handleCustomEvent = () => {
    const current = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
    emit(current);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_businesses_updated', handleCustomEvent);
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    if (unFirestore) unFirestore();
    clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_businesses_updated', handleCustomEvent);
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
  };
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const clean = slug ? slug.trim() : '';
  const normSlug = normalizeKey(clean);
  if (!normSlug) return null;

  // 1. Check local cache first
  const cached = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  const localMatch = cached.find(
    (b) =>
      normalizeKey(b.slug) === normSlug ||
      normalizeKey(b.id) === normSlug ||
      normalizeKey(b.name) === normSlug
  );
  if (localMatch) return localMatch;

  // 2. Query Firestore by slug or ID
  try {
    const q = query(collection(db, 'businesses'), where('slug', '==', clean));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return mapBusinessDoc(d.id, d.data());
    }

    const docRef = doc(db, 'businesses', clean);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapBusinessDoc(docSnap.id, docSnap.data());
    }

    // Try finding by normalized key in all Firestore businesses
    const allSnap = await getDocs(collection(db, 'businesses'));
    for (const d of allSnap.docs) {
      const bData = mapBusinessDoc(d.id, d.data());
      if (
        normalizeKey(bData.slug) === normSlug ||
        normalizeKey(bData.id) === normSlug ||
        normalizeKey(bData.name) === normSlug
      ) {
        return bData;
      }
    }
  } catch (err) {
    console.warn('[Firestore getBusinessBySlug warning]:', err);
  }

  // 3. Query Supabase
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .or(`slug.eq.${clean},slug.eq.${normSlug},id.eq.${clean}`);

      if (!error && data && data.length > 0) {
        return mapBusinessDoc(data[0].id, data[0]);
      }
    } catch {}
  }

  // 4. Query Server API
  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.name) {
        return mapBusinessDoc(data.id, data);
      }
    }
  } catch {}

  return null;
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
    category: data.category || 'Comércio & Serviços',
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    googleReviewUrl: data.googleReviewUrl || '',
    logoUrl: data.logoUrl || '',
    bannerUrl: data.bannerUrl || '',
    minRatingForGoogle: data.minRatingForGoogle || 4,
    qrThemeColor: data.qrThemeColor || '#4f46e5',
    activePlan: data.activePlan || 'pro',
    planId: data.planId || 'plan_pro',
    ownerId: data.ownerId || 'admin-created',
    currency: data.currency || 'EUR',
    status: data.status || 'active',
    password: data.password || 'reputa123',
    createdAt: now,
    updatedAt: now
  };

  // 1. Write to Firestore Cloud Database (Instant Multi-Device Sync)
  try {
    await setDoc(doc(db, 'businesses', id), newBiz);
  } catch (err) {
    console.warn('[Firestore addBusiness warning]:', err);
  }

  // 2. Write to Supabase Database
  if (isSupabaseConfigured()) {
    try {
      const supabaseRecord = {
        id,
        name: newBiz.name,
        slug: newBiz.slug,
        category: newBiz.category,
        address: newBiz.address,
        phone: newBiz.phone,
        email: newBiz.email,
        google_review_url: newBiz.googleReviewUrl || null,
        logo_url: newBiz.logoUrl || null,
        banner_url: newBiz.bannerUrl || null,
        min_rating_for_google: newBiz.minRatingForGoogle,
        qr_theme_color: newBiz.qrThemeColor,
        active_plan: newBiz.activePlan,
        plan_id: newBiz.planId,
        owner_id: newBiz.ownerId,
        currency: newBiz.currency,
        status: newBiz.status,
        password: newBiz.password,
        created_at: now,
        updated_at: now
      };
      await supabase.from('businesses').insert([supabaseRecord]);
    } catch (e) {
      console.warn('[Supabase addBusiness warning]:', e);
    }
  }

  // 3. Write to Server API
  try {
    await apiFetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBiz)
    });
  } catch {}

  // 4. Update Local Cache & trigger instant live sync event
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
  const cleanUpdates = { ...data, updatedAt: now };

  // 1. Update in Firestore
  try {
    await setDoc(doc(db, 'businesses', id), cleanUpdates, { merge: true });
  } catch (err) {
    console.warn('[Firestore updateBusiness warning]:', err);
  }

  // 2. Update in Supabase
  if (isSupabaseConfigured()) {
    try {
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
      if (data.googleReviewUrl !== undefined) dbUpdates.google_review_url = data.googleReviewUrl;
      if (data.logoUrl !== undefined) dbUpdates.logo_url = data.logoUrl;
      if (data.planId !== undefined) dbUpdates.plan_id = data.planId;

      await supabase.from('businesses').update(dbUpdates).eq('id', id);
    } catch {}
  }

  // 3. Update in Server API
  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanUpdates)
    });
  } catch {}

  // 4. Update in local cache
  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  const updated = list.map((b) => (b.id === id ? { ...b, ...cleanUpdates } : b));
  setCached(LOCAL_STORAGE_KEY_BIZ, updated);
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  // 1. Delete in Firestore
  try {
    await deleteDoc(doc(db, 'businesses', id));
  } catch (err) {
    console.warn('[Firestore deleteBusiness warning]:', err);
  }

  // 2. Delete in Supabase
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('businesses').delete().eq('id', id);
    } catch {}
  }

  // 3. Delete in Server API
  try {
    await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {}

  // 4. Update Local Cache
  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, []);
  const filtered = list.filter((b) => b.id !== id);
  setCached(LOCAL_STORAGE_KEY_BIZ, filtered);
  notifyDataChanged();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated'));
  }
}

// ==========================================
// REVIEWS SERVICE (MULTI-CLOUD SYNCHRONIZED)
// ==========================================
function mapReviewDoc(id: string, data: any): Review {
  return {
    id: id || data.id || `rev_${Date.now().toString(36)}`,
    businessId: data.businessId || data.business_id || '',
    customerId: data.customerId || data.customer_id || '',
    customerName: data.customerName || data.customer_name || 'Cliente',
    customerPhone: data.customerPhone || data.customer_phone || '',
    customerEmail: data.customerEmail || data.customer_email || '',
    rating: Number(data.rating || 5),
    channel: (data.channel as any) || 'qr',
    createdAt: data.createdAt || data.created_at || new Date().toISOString()
  };
}

export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  let isSubscribed = true;

  const emit = (list: Review[]) => {
    if (!isSubscribed) return;
    const filtered = businessId ? list.filter((r) => isMatchingBusiness(r.businessId, businessId)) : list;
    callback(filtered);
  };

  // 1. Local Cache initial
  const cached = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
  if (cached.length > 0) {
    emit(cached);
  }

  // 2. Real-time Firestore Listener
  let unFirestore: (() => void) | null = null;
  try {
    const reviewsCol = collection(db, 'reviews');
    unFirestore = onSnapshot(
      reviewsCol,
      (snapshot) => {
        const firestoreList: Review[] = [];
        snapshot.forEach((d) => {
          firestoreList.push(mapReviewDoc(d.id, d.data()));
        });
        firestoreList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCached(LOCAL_STORAGE_KEY_REVIEWS, firestoreList);
        emit(firestoreList);
      },
      (err) => {
        console.warn('[Firestore subscribeReviews warning]:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore setup reviews warning]:', err);
  }

  // 3. Polling secondary sources
  const fetchSecondary = async () => {
    let remote: Review[] = [];
    if (isSupabaseConfigured()) {
      try {
        const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) {
          remote = data.map((r: any) => mapReviewDoc(r.id, r));
        }
      } catch {}
    }

    if (remote.length === 0) {
      try {
        const res = await apiFetch(`/api/reviews${businessId ? `?businessId=${encodeURIComponent(businessId)}` : ''}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            remote = data.map((r: any) => mapReviewDoc(r.id, r));
          }
        }
      } catch {}
    }

    if (remote.length > 0 && isSubscribed) {
      remote.forEach((rev) => {
        try {
          setDoc(doc(db, 'reviews', rev.id), rev, { merge: true }).catch(() => {});
        } catch {}
      });
      setCached(LOCAL_STORAGE_KEY_REVIEWS, remote);
      emit(remote);
    }
  };

  fetchSecondary();
  const pollInterval = setInterval(fetchSecondary, 6000);

  const handleCustomEvent = () => {
    const current = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
    emit(current);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    if (unFirestore) unFirestore();
    clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
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

  // 1. Write to Firestore Cloud
  try {
    await setDoc(doc(db, 'reviews', id), newReview);
  } catch (err) {
    console.warn('[Firestore addReview warning]:', err);
  }

  // 2. Write to Supabase
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('reviews').insert([
        {
          id,
          business_id: newReview.businessId,
          customer_id: newReview.customerId || null,
          customer_name: newReview.customerName || null,
          customer_phone: newReview.customerPhone || null,
          customer_email: newReview.customerEmail || null,
          rating: newReview.rating,
          channel: newReview.channel,
          created_at: now
        }
      ]);
    } catch {}
  }

  // 3. Write to Server API
  try {
    await apiFetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReview)
    });
  } catch {}

  // 4. Automatically upsert customer record in CRM
  if (newReview.customerName || newReview.customerPhone || newReview.customerEmail) {
    try {
      await upsertCustomerFromReview(newReview);
    } catch {}
  }

  // 5. Update local cache
  const list = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
  setCached(LOCAL_STORAGE_KEY_REVIEWS, [newReview, ...list]);
  notifyDataChanged();

  return newReview;
}

export const submitReview = async (data: any): Promise<Review & { reviewId: string }> => {
  const rev = await addReview(data);
  return { ...rev, reviewId: rev.id };
};

export async function deleteReview(reviewId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
  } catch {}

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('reviews').delete().eq('id', reviewId);
    } catch {}
  }

  try {
    await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
  } catch {}

  const list = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
  setCached(LOCAL_STORAGE_KEY_REVIEWS, list.filter((r) => r.id !== reviewId));
  notifyDataChanged();
}

export async function clearAllReviews(businessId?: string): Promise<void> {
  const list = getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, []);
  if (businessId) {
    setCached(LOCAL_STORAGE_KEY_REVIEWS, list.filter((r) => !isMatchingBusiness(r.businessId, businessId)));
  } else {
    setCached(LOCAL_STORAGE_KEY_REVIEWS, []);
  }
  notifyDataChanged();
}

// ==========================================
// FEEDBACK SERVICE (INTERNAL ADAPTIVE REVIEW FLOW)
// ==========================================
function mapFeedbackDoc(id: string, data: any): Feedback {
  return {
    id: id || data.id || `fb_${Date.now().toString(36)}`,
    businessId: data.businessId || data.business_id || '',
    reviewId: data.reviewId || data.review_id || '',
    customerId: data.customerId || data.customer_id || '',
    customerName: data.customerName || data.customer_name || 'Cliente',
    customerPhone: data.customerPhone || data.customer_phone || '',
    customerEmail: data.customerEmail || data.customer_email || '',
    rating: Number(data.rating || 1),
    question1: data.question1 || '',
    question2: data.question2 || '',
    question3WantsContact: Boolean(data.question3WantsContact ?? data.question3_wants_contact ?? true),
    createdAt: data.createdAt || data.created_at || new Date().toISOString()
  };
}

export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  let isSubscribed = true;

  const emit = (list: Feedback[]) => {
    if (!isSubscribed) return;
    const filtered = businessId ? list.filter((f) => isMatchingBusiness(f.businessId, businessId)) : list;
    callback(filtered);
  };

  const cached = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []);
  if (cached.length > 0) emit(cached);

  let unFirestore: (() => void) | null = null;
  try {
    const colRef = collection(db, 'feedback');
    unFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        const list: Feedback[] = [];
        snapshot.forEach((d) => list.push(mapFeedbackDoc(d.id, d.data())));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCached(LOCAL_STORAGE_KEY_FEEDBACK, list);
        emit(list);
      },
      () => {}
    );
  } catch {}

  const handleCustomEvent = () => emit(getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []));
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    if (unFirestore) unFirestore();
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
  };
}

// ==========================================
// RECOVERY CASES SERVICE
// ==========================================
function mapRecoveryDoc(id: string, data: any): RecoveryCase {
  return {
    id: id || data.id || `case_${Date.now().toString(36)}`,
    businessId: data.businessId || data.business_id || '',
    customerId: data.customerId || data.customer_id || '',
    reviewId: data.reviewId || data.review_id || '',
    feedbackId: data.feedbackId || data.feedback_id || '',
    customerName: data.customerName || data.customer_name || 'Cliente',
    customerPhone: data.customerPhone || data.customer_phone || '',
    customerEmail: data.customerEmail || data.customer_email || '',
    rating: Number(data.rating || 1),
    status: (data.status as RecoveryCaseStatus) || 'novo',
    notes: data.notes || '',
    assignedTo: data.assignedTo || data.assigned_to || '',
    resolvedAt: data.resolvedAt || data.resolved_at || undefined,
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
  };
}

export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  let isSubscribed = true;

  const emit = (list: RecoveryCase[]) => {
    if (!isSubscribed) return;
    const filtered = businessId ? list.filter((c) => isMatchingBusiness(c.businessId, businessId)) : list;
    callback(filtered);
  };

  const cached = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
  if (cached.length > 0) emit(cached);

  let unFirestore: (() => void) | null = null;
  try {
    const colRef = collection(db, 'recovery_cases');
    unFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        const list: RecoveryCase[] = [];
        snapshot.forEach((d) => list.push(mapRecoveryDoc(d.id, d.data())));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCached(LOCAL_STORAGE_KEY_CASES, list);
        emit(list);
      },
      () => {}
    );
  } catch {}

  const handleCustomEvent = () => emit(getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []));
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    if (unFirestore) unFirestore();
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
  };
}

export async function addFeedbackAndCreateRecoveryCase(
  feedbackData: Omit<Feedback, 'id' | 'createdAt'>,
  reviewId: string
): Promise<{ feedback: Feedback; recoveryCase: RecoveryCase }> {
  const fbId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const caseId = `case_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
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
    customerName: feedbackData.customerName,
    customerPhone: feedbackData.customerPhone,
    customerEmail: feedbackData.customerEmail,
    rating: feedbackData.rating,
    status: 'novo',
    notes: `Motivo: ${feedbackData.question1 || 'Não informado'}. Melhorias: ${feedbackData.question2 || 'Não informado'}`,
    createdAt: now,
    updatedAt: now
  };

  // 1. Save in Firestore
  try {
    await Promise.all([
      setDoc(doc(db, 'feedback', fbId), feedback),
      setDoc(doc(db, 'recovery_cases', caseId), recoveryCase)
    ]);
  } catch (err) {
    console.warn('[Firestore addFeedbackAndCreateRecoveryCase warning]:', err);
  }

  // 2. Save in Supabase
  if (isSupabaseConfigured()) {
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
    } catch {}
  }

  // 3. Save in Server API
  try {
    await Promise.all([
      apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback)
      }),
      apiFetch('/api/recovery-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recoveryCase)
      })
    ]);
  } catch {}

  // 4. Update CRM Customer record
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

  // 5. Update local cache
  const currentFb = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, []);
  setCached(LOCAL_STORAGE_KEY_FEEDBACK, [feedback, ...currentFb]);

  const currentCases = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
  setCached(LOCAL_STORAGE_KEY_CASES, [recoveryCase, ...currentCases]);

  notifyDataChanged();

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
  const updates: any = { status, updatedAt: now };
  if (notes !== undefined) updates.notes = notes;
  if (status === 'resolvido' || status === 'cliente_recuperado') {
    updates.resolvedAt = now;
  }

  try {
    await setDoc(doc(db, 'recovery_cases', caseId), updates, { merge: true });
  } catch {}

  if (customerId) {
    const custStatus = status === 'cliente_recuperado' ? 'recovered' : status === 'resolvido' ? 'active' : 'in_recovery';
    try {
      await updateDoc(doc(db, 'customers', customerId), { status: custStatus, updatedAt: now });
    } catch {}
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('recovery_cases').update(updates).eq('id', caseId);
    } catch {}
  }

  try {
    await apiFetch(`/api/recovery-cases/${encodeURIComponent(caseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch {}

  const currentCases = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_CASES, []);
  const updated = currentCases.map((c) => (c.id === caseId ? { ...c, ...updates } : c));
  setCached(LOCAL_STORAGE_KEY_CASES, updated);
  notifyDataChanged();
}

// ==========================================
// CUSTOMERS CRM SERVICE
// ==========================================
function mapCustomerDoc(id: string, data: any): Customer {
  return {
    id: id || data.id || `cust_${Date.now().toString(36)}`,
    businessId: data.businessId || data.business_id || '',
    name: data.name || 'Cliente',
    phone: data.phone || '',
    email: data.email || '',
    reviewsCount: Number(data.reviewsCount ?? data.reviews_count ?? data.totalReviews ?? 1),
    lastReviewAt: data.lastReviewAt || data.last_review_at || new Date().toISOString(),
    avgRating: Number(data.avgRating ?? data.avg_rating ?? data.rating ?? 5),
    status: (data.status as any) || 'active',
    internalNotes: data.internalNotes || data.internal_notes || '',
    lastInteractionAt: data.lastInteractionAt || data.last_interaction_at || undefined,
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
  };
}

export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  let isSubscribed = true;

  const emit = (list: Customer[]) => {
    if (!isSubscribed) return;
    const filtered = businessId ? list.filter((c) => isMatchingBusiness(c.businessId, businessId)) : list;
    callback(filtered);
  };

  const cached = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
  if (cached.length > 0) emit(cached);

  let unFirestore: (() => void) | null = null;
  try {
    const colRef = collection(db, 'customers');
    unFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        const list: Customer[] = [];
        snapshot.forEach((d) => list.push(mapCustomerDoc(d.id, d.data())));
        list.sort((a, b) => new Date(b.lastReviewAt).getTime() - new Date(a.lastReviewAt).getTime());
        setCached(LOCAL_STORAGE_KEY_CUSTOMERS, list);
        emit(list);
      },
      () => {}
    );
  } catch {}

  const handleCustomEvent = () => emit(getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []));
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    if (unFirestore) unFirestore();
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
  };
}

export async function upsertCustomerFromReview(review: Review): Promise<Customer> {
  const current = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
  const cleanPhone = (review.customerPhone || '').trim();
  const cleanEmail = (review.customerEmail || '').trim().toLowerCase();
  const cleanName = (review.customerName || 'Cliente').trim();

  const existing = current.find(
    (c) =>
      isMatchingBusiness(c.businessId, review.businessId) &&
      ((cleanPhone && c.phone === cleanPhone) || (cleanEmail && c.email?.toLowerCase() === cleanEmail))
  );

  const now = new Date().toISOString();

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
      await setDoc(doc(db, 'customers', existing.id), updatedCust, { merge: true });
    } catch {}

    const updatedList = current.map((c) => (c.id === existing.id ? updatedCust : c));
    setCached(LOCAL_STORAGE_KEY_CUSTOMERS, updatedList);
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
      await setDoc(doc(db, 'customers', custId), newCust);
    } catch {}

    setCached(LOCAL_STORAGE_KEY_CUSTOMERS, [newCust, ...current]);
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
    await setDoc(doc(db, 'customers', custId), newCust);
  } catch {}

  const current = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
  setCached(LOCAL_STORAGE_KEY_CUSTOMERS, [newCust, ...current]);
  notifyDataChanged();

  return newCust;
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  const now = new Date().toISOString();
  const clean = { ...updates, updatedAt: now };

  try {
    await setDoc(doc(db, 'customers', id), clean, { merge: true });
  } catch {}

  const current = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
  setCached(LOCAL_STORAGE_KEY_CUSTOMERS, current.map((c) => (c.id === id ? { ...c, ...clean } : c)));
  notifyDataChanged();
}

export async function deleteCustomer(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'customers', id));
  } catch {}

  const current = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, []);
  setCached(LOCAL_STORAGE_KEY_CUSTOMERS, current.filter((c) => c.id !== id));
  notifyDataChanged();
}

// ==========================================
// INTERACTIONS SERVICE
// ==========================================
export function subscribeInteractions(businessId: string | null, callback: (list: Interaction[]) => void) {
  let isSubscribed = true;

  const emit = (list: Interaction[]) => {
    if (!isSubscribed) return;
    const filtered = businessId ? list.filter((i) => isMatchingBusiness(i.businessId, businessId)) : list;
    callback(filtered);
  };

  let unFirestore: (() => void) | null = null;
  try {
    const colRef = collection(db, 'interactions');
    unFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        const list: Interaction[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            businessId: data.businessId || data.business_id || '',
            customerId: data.customerId || data.customer_id || '',
            caseId: data.caseId || data.case_id || '',
            type: data.type || 'whatsapp',
            summary: data.summary || '',
            outcome: data.outcome || '',
            staffEmail: data.staffEmail || data.staff_email || '',
            staffName: data.staffName || data.staff_name || '',
            createdAt: data.createdAt || data.created_at || new Date().toISOString()
          });
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        emit(list);
      },
      () => {}
    );
  } catch {}

  return () => {
    isSubscribed = false;
    if (unFirestore) unFirestore();
  };
}

export async function addInteraction(data: Omit<Interaction, 'id' | 'createdAt'>): Promise<Interaction> {
  const id = `int_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const interaction: Interaction = { ...data, id, createdAt: now };

  try {
    await setDoc(doc(db, 'interactions', id), interaction);
  } catch {}

  return interaction;
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
  try {
    const snap = await getDocs(collection(db, 'plans'));
    if (!snap.empty) {
      const list: Plan[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      return list;
    }
  } catch {}

  return DEFAULT_PLANS;
}

export async function savePlan(plan: Plan): Promise<void> {
  try {
    await setDoc(doc(db, 'plans', plan.id), plan, { merge: true });
  } catch {}
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  id: 'default',
  platformName: 'ReputaFlow',
  supportEmail: 'suporte@reputaflow.com',
  defaultGoogleReviewInstructions:
    'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes na comunidade.',
  allowPublicRegistration: false
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'platform_settings'));
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as any) };
    }
  } catch {}

  return DEFAULT_PLATFORM_SETTINGS;
}

export async function savePlatformSettings(settings: Partial<PlatformSettings>): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'platform_settings'), settings, { merge: true });
  } catch {}
}
