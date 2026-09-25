import {
  Business,
  Customer,
  Review,
  Feedback,
  RecoveryCase,
  RecoveryCaseStatus,
  Interaction,
  Plan,
  PlatformSettings,
  UserProfile
} from '../types';
import {
  REGISTERED_BUSINESSES,
  INITIAL_REVIEWS,
  INITIAL_FEEDBACK,
  INITIAL_CUSTOMERS,
  INITIAL_RECOVERY_CASES
} from './initialData';

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
// BULLETPROOF IMAGE UPLOAD SERVICE (WITH BASE64 FALLBACK)
// ==========================================
export async function uploadImage(file: File): Promise<string> {
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
          } catch (netErr) {
            console.warn('Server upload unreachable, using base64 data URL fallback:', netErr);
          }

          resolve(base64Data);
        } catch (canvasErr) {
          console.warn('Canvas processing error, using raw reader result:', canvasErr);
          resolve(e.target?.result as string || '');
        }
      };
      img.onerror = () => {
        resolve(e.target?.result as string || '');
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      resolve('');
    };
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
// CACHE & CROSS-DEVICE EVENT BUS
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
  try {
    const res = await apiFetch('/api/businesses');
    if (res.ok) {
      const data: Business[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setCached(LOCAL_STORAGE_KEY_BIZ, data);
        return data;
      }
    }
  } catch (e) {
    console.warn('getAllBusinesses network warning:', e);
  }
  return getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  const norm = normalizeKey(slug);

  // 1. Fetch from server API
  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(cleanSlug)}`);
    if (res.ok) {
      const biz: Business = await res.json();
      if (biz) {
        return biz;
      }
    }
  } catch (e) {
    console.warn('getBusinessBySlug network warning:', e);
  }

  // 2. Check cached list
  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  const found = list.find((b) => {
    if (!b) return false;
    const bId = (b.id || '').toLowerCase();
    const bSlug = (b.slug || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    return (
      bSlug === cleanSlug ||
      bId === cleanSlug ||
      bName === cleanSlug ||
      normalizeKey(bSlug) === norm ||
      normalizeKey(bId) === norm ||
      normalizeKey(bName) === norm
    );
  });

  return found || null;
}

export async function getBusinessById(id: string): Promise<Business | null> {
  if (!id) return null;
  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(id)}`);
    if (res.ok) {
      const biz: Business = await res.json();
      return biz;
    }
  } catch (e) {
    console.warn('getBusinessById network warning:', e);
  }

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  return list.find((b) => b.id === id) || null;
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  callback(getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES));

  const fetchLatest = async () => {
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
  const interval = setInterval(fetchLatest, 2000);

  const handleLiveEvent = () => fetchLatest();
  window.addEventListener('reputaflow_live_sync', handleLiveEvent);
  window.addEventListener('focus', handleLiveEvent);

  return () => {
    clearInterval(interval);
    window.removeEventListener('reputaflow_live_sync', handleLiveEvent);
    window.removeEventListener('focus', handleLiveEvent);
  };
}

export async function createBusiness(data: Omit<Business, 'id'>, customId?: string): Promise<string> {
  const targetId = customId || `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const payload = { ...data, id: targetId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

  try {
    const res = await apiFetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      notifyDataChanged();
      return targetId;
    }
  } catch (err) {
    console.warn('Server create business failed, saving locally:', err);
  }

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  setCached(LOCAL_STORAGE_KEY_BIZ, [payload, ...list]);
  notifyDataChanged();
  return targetId;
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      notifyDataChanged();
      return;
    }
  } catch (err) {
    console.warn('Server update business failed, updating locally:', err);
  }

  // Fallback local update (works 100% on Vercel / static hosts)
  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  const updatedList = list.map((b) => (b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b));
  setCached(LOCAL_STORAGE_KEY_BIZ, updatedList);
  notifyDataChanged();
}

export async function deleteBusiness(id: string): Promise<void> {
  try {
    const res = await apiFetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      notifyDataChanged();
      return;
    }
  } catch (err) {
    console.warn('Server delete business failed, deleting locally:', err);
  }

  const list = getCached<Business[]>(LOCAL_STORAGE_KEY_BIZ, REGISTERED_BUSINESSES);
  setCached(LOCAL_STORAGE_KEY_BIZ, list.filter((b) => b.id !== id));
  notifyDataChanged();
}

// ==========================================
// REVIEWS
// ==========================================
export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const filterAndSort = (list: Review[]) => {
    const filtered = list.filter((r) => isMatchingBusiness(r.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getCached<Review[]>(LOCAL_STORAGE_KEY_REVIEWS, INITIAL_REVIEWS)));

  const fetchLatest = async () => {
    try {
      const url = businessId ? `/api/reviews?businessId=${encodeURIComponent(businessId)}` : '/api/reviews';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Review[] = await res.json();
        if (Array.isArray(data)) {
          setCached(LOCAL_STORAGE_KEY_REVIEWS, data);
          callback(filterAndSort(data));
        }
      }
    } catch (e) {}
  };

  fetchLatest();
  const interval = setInterval(fetchLatest, 2000);

  const handleLiveEvent = () => fetchLatest();
  window.addEventListener('reputaflow_live_sync', handleLiveEvent);
  window.addEventListener('focus', handleLiveEvent);

  return () => {
    clearInterval(interval);
    window.removeEventListener('reputaflow_live_sync', handleLiveEvent);
    window.removeEventListener('focus', handleLiveEvent);
  };
}

export async function submitReview(
  data: Omit<Review, 'id' | 'createdAt'>
): Promise<{ reviewId: string }> {
  const targetId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const payload = {
    ...data,
    id: targetId,
    createdAt: now
  };

  try {
    const res = await apiFetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
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
  } catch (err) {
    console.warn('Server submit review failed, saving locally:', err);
  }

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

// ==========================================
// FEEDBACK & RECOVERY
// ==========================================
export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  const filterAndSort = (list: Feedback[]) => {
    const filtered = list.filter((f) => isMatchingBusiness(f.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, INITIAL_FEEDBACK)));

  const fetchLatest = async () => {
    try {
      const url = businessId ? `/api/feedback?businessId=${encodeURIComponent(businessId)}` : '/api/feedback';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Feedback[] = await res.json();
        if (Array.isArray(data)) {
          setCached(LOCAL_STORAGE_KEY_FEEDBACK, data);
          callback(filterAndSort(data));
        }
      }
    } catch (e) {}
  };

  fetchLatest();
  const interval = setInterval(fetchLatest, 2000);

  const handleLiveEvent = () => fetchLatest();
  window.addEventListener('reputaflow_live_sync', handleLiveEvent);
  window.addEventListener('focus', handleLiveEvent);

  return () => {
    clearInterval(interval);
    window.removeEventListener('reputaflow_live_sync', handleLiveEvent);
    window.removeEventListener('focus', handleLiveEvent);
  };
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
    businessId: params.businessId,
    reviewId: params.reviewId,
    customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    rating: params.rating,
    question1: params.question1,
    question2: params.question2,
    question3WantsContact: params.question3WantsContact,
    createdAt: now
  };

  const casePayload = {
    id: caseId,
    businessId: params.businessId,
    customerId,
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

  try {
    await Promise.all([
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
    ]);
  } catch (err) {
    console.warn('Server feedback/recovery save failed, caching locally:', err);
  }

  const fbList = getCached<Feedback[]>(LOCAL_STORAGE_KEY_FEEDBACK, INITIAL_FEEDBACK);
  setCached(LOCAL_STORAGE_KEY_FEEDBACK, [fbPayload, ...fbList]);

  const caseList = getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES);
  setCached(LOCAL_STORAGE_KEY_RECOVERY, [casePayload, ...caseList]);

  notifyDataChanged();
  return { feedbackId: fbId, caseId, customerId };
}

// ==========================================
// CUSTOMERS (CRM)
// ==========================================
export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  const filterAndSort = (list: Customer[]) => {
    const filtered = list.filter((c) => isMatchingBusiness(c.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());
  };

  callback(filterAndSort(getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, INITIAL_CUSTOMERS)));

  const fetchLatest = async () => {
    try {
      const url = businessId ? `/api/customers?businessId=${encodeURIComponent(businessId)}` : '/api/customers';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Customer[] = await res.json();
        if (Array.isArray(data)) {
          setCached(LOCAL_STORAGE_KEY_CUSTOMERS, data);
          callback(filterAndSort(data));
        }
      }
    } catch (e) {}
  };

  fetchLatest();
  const interval = setInterval(fetchLatest, 2000);

  const handleLiveEvent = () => fetchLatest();
  window.addEventListener('reputaflow_live_sync', handleLiveEvent);
  window.addEventListener('focus', handleLiveEvent);

  return () => {
    clearInterval(interval);
    window.removeEventListener('reputaflow_live_sync', handleLiveEvent);
    window.removeEventListener('focus', handleLiveEvent);
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

  try {
    const res = await apiFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const saved = await res.json();
      notifyDataChanged();
      return saved.id || targetId;
    }
  } catch (err) {
    console.warn('Server upsert customer failed, caching locally:', err);
  }

  const list = getCached<Customer[]>(LOCAL_STORAGE_KEY_CUSTOMERS, INITIAL_CUSTOMERS);
  setCached(LOCAL_STORAGE_KEY_CUSTOMERS, [payload, ...list]);
  notifyDataChanged();
  return targetId;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  try {
    const res = await apiFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, id })
    });
    if (res.ok) {
      notifyDataChanged();
      return;
    }
  } catch (err) {
    console.warn('Server update customer failed, updating locally:', err);
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
  const filterAndSort = (list: RecoveryCase[]) => {
    const filtered = list.filter((c) => isMatchingBusiness(c.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getCached<RecoveryCase[]>(LOCAL_STORAGE_KEY_RECOVERY, INITIAL_RECOVERY_CASES)));

  const fetchLatest = async () => {
    try {
      const url = businessId ? `/api/recovery_cases?businessId=${encodeURIComponent(businessId)}` : '/api/recovery_cases';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: RecoveryCase[] = await res.json();
        if (Array.isArray(data)) {
          setCached(LOCAL_STORAGE_KEY_RECOVERY, data);
          callback(filterAndSort(data));
        }
      }
    } catch (e) {}
  };

  fetchLatest();
  const interval = setInterval(fetchLatest, 2000);

  const handleLiveEvent = () => fetchLatest();
  window.addEventListener('reputaflow_live_sync', handleLiveEvent);
  window.addEventListener('focus', handleLiveEvent);

  return () => {
    clearInterval(interval);
    window.removeEventListener('reputaflow_live_sync', handleLiveEvent);
    window.removeEventListener('focus', handleLiveEvent);
  };
}

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  try {
    const res = await apiFetch(`/api/recovery_cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(notes ? { notes } : {})
      })
    });
    if (res.ok) {
      if (customerId) {
        let customerStatus: Customer['status'] = 'in_recovery';
        if (status === 'cliente_recuperado') customerStatus = 'recovered';
        if (status === 'resolvido') customerStatus = 'active';
        updateCustomer(customerId, { status: customerStatus }).catch(() => {});
      }
      notifyDataChanged();
      return;
    }
  } catch (err) {
    console.warn('Server update recovery case failed, updating locally:', err);
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
  const filterAndSort = (list: Interaction[]) => {
    const filtered = list.filter((i) => isMatchingBusiness(i.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getCached<Interaction[]>(LOCAL_STORAGE_KEY_INTERACTIONS, [])));

  const fetchLatest = async () => {
    try {
      const url = businessId ? `/api/interactions?businessId=${encodeURIComponent(businessId)}` : '/api/interactions';
      const res = await apiFetch(url);
      if (res.ok) {
        const data: Interaction[] = await res.json();
        if (Array.isArray(data)) {
          setCached(LOCAL_STORAGE_KEY_INTERACTIONS, data);
          callback(filterAndSort(data));
        }
      }
    } catch (e) {}
  };

  fetchLatest();
  const interval = setInterval(fetchLatest, 2000);

  const handleLiveEvent = () => fetchLatest();
  window.addEventListener('reputaflow_live_sync', handleLiveEvent);
  window.addEventListener('focus', handleLiveEvent);

  return () => {
    clearInterval(interval);
    window.removeEventListener('reputaflow_live_sync', handleLiveEvent);
    window.removeEventListener('focus', handleLiveEvent);
  };
}

export async function addInteraction(
  data: Omit<Interaction, 'id' | 'createdAt'>
): Promise<string> {
  const targetId = `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const payload = {
    ...data,
    id: targetId,
    createdAt: now
  };

  try {
    const res = await apiFetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      notifyDataChanged();
      return targetId;
    }
  } catch (err) {
    console.warn('Server add interaction failed, saving locally:', err);
  }

  const list = getCached<Interaction[]>(LOCAL_STORAGE_KEY_INTERACTIONS, []);
  setCached(LOCAL_STORAGE_KEY_INTERACTIONS, [payload, ...list]);
  notifyDataChanged();
  return targetId;
}

// ==========================================
// PLANS & PLATFORM SETTINGS
// ==========================================
export async function getPlans(): Promise<Plan[]> {
  try {
    const res = await apiFetch('/api/plans');
    if (res.ok) {
      const plans = await res.json();
      return plans;
    }
  } catch (e) {}
  return [];
}

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  try {
    const res = await apiFetch('/api/settings');
    if (res.ok) {
      const s = await res.json();
      return s;
    }
  } catch (e) {}
  return null;
}

export async function updatePlatformSettings(settings: Partial<PlatformSettings>): Promise<void> {
  try {
    await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  } catch (e) {}
  notifyDataChanged();
}

export async function savePlatformSettings(settings: Partial<PlatformSettings>): Promise<void> {
  return updatePlatformSettings(settings);
}

export async function savePlan(plan: Plan): Promise<void> {
  notifyDataChanged();
}
