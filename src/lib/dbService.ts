import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import {
  REGISTERED_BUSINESSES,
  INITIAL_REVIEWS,
  INITIAL_FEEDBACK,
  INITIAL_CUSTOMERS,
  INITIAL_RECOVERY_CASES
} from './initialData';
import { fetchGlobalCloudData, pushGlobalCloudData } from './cloudSync';
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

// ==========================================
// UTILS
// ==========================================

export function normalizeKey(str: string = ''): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  });
  return result;
}

// ==========================================
// BUSINESSES (LOCAL & FIRESTORE RESILIENT PERSISTENCE)
// ==========================================

const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_local_businesses';
const LOCAL_STORAGE_KEY_DELETED = 'reputaflow_deleted_businesses';
const LOCAL_STORAGE_KEY_REVIEWS = 'reputaflow_local_reviews';
const LOCAL_STORAGE_KEY_FEEDBACK = 'reputaflow_local_feedback';
const LOCAL_STORAGE_KEY_CUSTOMERS = 'reputaflow_local_customers';
const LOCAL_STORAGE_KEY_RECOVERY = 'reputaflow_local_recovery_cases';
const LOCAL_STORAGE_KEY_INTERACTIONS = 'reputaflow_local_interactions';

let bc: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined') {
    bc = new BroadcastChannel('reputaflow_sync_channel');
    bc.onmessage = (event) => {
      if (event.data) {
        if (event.data.type === 'BUSINESS_UPDATED') {
          window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated', { detail: event.data.payload }));
        } else if (event.data.type === 'DATA_UPDATED') {
          window.dispatchEvent(new CustomEvent('reputaflow_data_updated'));
        }
      }
    };
    window.addEventListener('storage', (e) => {
      if (e.key === LOCAL_STORAGE_KEY_BIZ && e.newValue) {
        try {
          const list = JSON.parse(e.newValue);
          window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated', { detail: list }));
        } catch (err) {}
      } else if (
        e.key === LOCAL_STORAGE_KEY_REVIEWS ||
        e.key === LOCAL_STORAGE_KEY_FEEDBACK ||
        e.key === LOCAL_STORAGE_KEY_CUSTOMERS ||
        e.key === LOCAL_STORAGE_KEY_RECOVERY
      ) {
        window.dispatchEvent(new CustomEvent('reputaflow_data_updated'));
      }
    });
  }
} catch (e) {}

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_data_updated'));
    if (bc) {
      try { bc.postMessage({ type: 'DATA_UPDATED' }); } catch (e) {}
    }
  }
}

// ---------------- LOCAL REVIEWS ----------------
export function getLocalReviews(): Review[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REVIEWS);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY_REVIEWS, JSON.stringify(INITIAL_REVIEWS));
      return INITIAL_REVIEWS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_REVIEWS;
  }
}

export function saveLocalReview(review: Review): void {
  try {
    const list = getLocalReviews();
    const idx = list.findIndex(r => r.id === review.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...review };
    } else {
      list.unshift(review);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_REVIEWS, JSON.stringify(list));
    notifyDataChanged();
  } catch (e) {
    console.warn('saveLocalReview error:', e);
  }
}

// ---------------- LOCAL FEEDBACK ----------------
export function getLocalFeedback(): Feedback[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_FEEDBACK);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY_FEEDBACK, JSON.stringify(INITIAL_FEEDBACK));
      return INITIAL_FEEDBACK;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_FEEDBACK;
  }
}

export function saveLocalFeedback(fb: Feedback): void {
  try {
    const list = getLocalFeedback();
    const idx = list.findIndex(f => f.id === fb.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...fb };
    } else {
      list.unshift(fb);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_FEEDBACK, JSON.stringify(list));
    notifyDataChanged();
  } catch (e) {
    console.warn('saveLocalFeedback error:', e);
  }
}

// ---------------- LOCAL CUSTOMERS ----------------
export function getLocalCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_CUSTOMERS);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY_CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
      return INITIAL_CUSTOMERS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_CUSTOMERS;
  }
}

export function saveLocalCustomer(cust: Customer): void {
  try {
    const list = getLocalCustomers();
    const idx = list.findIndex(c => c.id === cust.id || (cust.phone && c.phone === cust.phone && c.businessId === cust.businessId));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...cust };
    } else {
      list.unshift(cust);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_CUSTOMERS, JSON.stringify(list));
    notifyDataChanged();
  } catch (e) {
    console.warn('saveLocalCustomer error:', e);
  }
}

// ---------------- LOCAL RECOVERY CASES ----------------
export function getLocalRecoveryCases(): RecoveryCase[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_RECOVERY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY_RECOVERY, JSON.stringify(INITIAL_RECOVERY_CASES));
      return INITIAL_RECOVERY_CASES;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_RECOVERY_CASES;
  }
}

export function saveLocalRecoveryCase(rc: RecoveryCase): void {
  try {
    const list = getLocalRecoveryCases();
    const idx = list.findIndex(c => c.id === rc.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...rc };
    } else {
      list.unshift(rc);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_RECOVERY, JSON.stringify(list));
    notifyDataChanged();
  } catch (e) {
    console.warn('saveLocalRecoveryCase error:', e);
  }
}

// ---------------- LOCAL INTERACTIONS ----------------
export function getLocalInteractions(): Interaction[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_INTERACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalInteraction(item: Interaction): void {
  try {
    const list = getLocalInteractions();
    const idx = list.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...item };
    } else {
      list.unshift(item);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_INTERACTIONS, JSON.stringify(list));
    notifyDataChanged();
  } catch (e) {
    console.warn('saveLocalInteraction error:', e);
  }
}

export function getDeletedBusinessIds(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_DELETED);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const permanentDeleted = ['biz_bistro_paris', 'biz_clinica_estetica'];
    return Array.from(new Set([...list, ...permanentDeleted]));
  } catch {
    return ['biz_bistro_paris', 'biz_clinica_estetica'];
  }
}

export function markBusinessAsDeleted(id: string): void {
  try {
    const deleted = getDeletedBusinessIds();
    if (!deleted.includes(id)) {
      deleted.push(id);
      localStorage.setItem(LOCAL_STORAGE_KEY_DELETED, JSON.stringify(deleted));
    }
  } catch (e) {
    console.error('Failed to mark business as deleted:', e);
  }
}

export function getLocalBusinesses(): Business[] {
  const deletedIds = new Set(getDeletedBusinessIds());
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_BIZ);
    let list: Business[] = raw ? JSON.parse(raw) : [];

    // Filter out deleted businesses and fantasy demo businesses
    list = list.filter(b => 
      b && 
      !deletedIds.has(b.id) && 
      b.slug !== 'bistro-paris' && 
      b.slug !== 'clinica-estetica'
    );

    // If local storage is empty, initialize with official registered businesses
    if (list.length === 0) {
      list = REGISTERED_BUSINESSES.filter(b => !deletedIds.has(b.id));
      localStorage.setItem(LOCAL_STORAGE_KEY_BIZ, JSON.stringify(list));
    }

    return list;
  } catch (e) {
    return REGISTERED_BUSINESSES.filter(b => !deletedIds.has(b.id));
  }
}

export function saveLocalBusiness(biz: Business): void {
  if (!biz || !biz.id) return;
  const deletedIds = new Set(getDeletedBusinessIds());
  if (deletedIds.has(biz.id) || biz.slug === 'bistro-paris' || biz.slug === 'clinica-estetica') {
    return;
  }
  try {
    const list = getLocalBusinesses();
    const idx = list.findIndex(b => b.id === biz.id || (biz.slug && b.slug === biz.slug));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...biz };
    } else {
      list.unshift(biz);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_BIZ, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated', { detail: list }));
    if (bc) {
      try { bc.postMessage({ type: 'BUSINESS_UPDATED', payload: list }); } catch (e) {}
    }
  } catch (e) {
    console.error('Failed to save business locally:', e);
  }
}

export function removeLocalBusiness(id: string): void {
  markBusinessAsDeleted(id);
  try {
    const current = getLocalBusinesses();
    const list = current.filter(b => b.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY_BIZ, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated', { detail: list }));
  } catch (e) {
    console.error('Failed to remove business locally:', e);
  }
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  const norm = normalizeKey(slug);
  const deletedIds = new Set(getDeletedBusinessIds());

  // Function to check if a business matches the query slug
  const matches = (b: Business | null | undefined) => {
    if (!b || deletedIds.has(b.id)) return false;
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
  };

  // 1. FAST LOCAL RETRIEVAL
  const localList = getLocalBusinesses();
  const localMatch = localList.find(matches);

  // Trigger background remote fetch to pull the latest updated logo & details
  const remoteFetchPromise = (async (): Promise<Business | null> => {
    // A. Check Global Cloud Sync Store (fast cross-device synchronization)
    try {
      const cloudData = await fetchGlobalCloudData();
      if (cloudData && Array.isArray(cloudData.businesses)) {
        const found = cloudData.businesses.find(matches);
        if (found) {
          saveLocalBusiness(found);
          return found;
        }
      }
    } catch (e) {}

    // B. Check Firestore query by slug
    try {
      const q = query(collection(db, 'businesses'), where('slug', '==', cleanSlug), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = { id: snap.docs[0].id, ...snap.docs[0].data() } as Business;
        if (!deletedIds.has(found.id)) {
          saveLocalBusiness(found);
          return found;
        }
      }
    } catch (e) {}

    // C. Check Backend Server API
    try {
      const res = await fetch(`/api/businesses/${encodeURIComponent(cleanSlug)}`);
      if (res.ok) {
        const serverBiz = await res.json();
        if (serverBiz && !deletedIds.has(serverBiz.id)) {
          saveLocalBusiness(serverBiz);
          return serverBiz;
        }
      }
    } catch (e) {}

    return null;
  })();

  // If we already have a local match, return it immediately so the screen is never blank,
  // and when the remote fetch finishes, if there is updated data (e.g. logoUrl changed), it will update via saveLocalBusiness.
  if (localMatch) {
    remoteFetchPromise.then(remoteBiz => {
      if (remoteBiz && (remoteBiz.logoUrl !== localMatch.logoUrl || remoteBiz.name !== localMatch.name)) {
        saveLocalBusiness(remoteBiz);
      }
    });
    return localMatch;
  }

  // If not found in local storage, wait up to 1.5s for remote fetch
  try {
    const remoteBiz = await Promise.race([
      remoteFetchPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    ]);
    if (remoteBiz) return remoteBiz;
  } catch (e) {}

  // Fallback to REGISTERED_BUSINESSES default list
  const registeredMatch = REGISTERED_BUSINESSES.find(matches);
  if (registeredMatch) {
    saveLocalBusiness(registeredMatch);
    return registeredMatch;
  }

  return null;
}

export async function getBusinessById(id: string): Promise<Business | null> {
  const localMatch = getLocalBusinesses().find(b => b.id === id);
  if (localMatch) return localMatch;

  try {
    const res = await fetch(`/api/businesses/${encodeURIComponent(id)}`);
    if (res.ok) {
      const serverBiz = await res.json();
      if (serverBiz && serverBiz.id) {
        saveLocalBusiness(serverBiz);
        return serverBiz;
      }
    }
  } catch {}

  const path = `businesses/${id}`;
  try {
    const snapPromise = getDoc(doc(db, 'businesses', id));
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    const snap = await Promise.race([snapPromise, timeout]);
    if (snap && snap.exists()) {
      const found = { id: snap.id, ...snap.data() } as Business;
      saveLocalBusiness(found);
      return found;
    }
    return localMatch || null;
  } catch (err) {
    return localMatch || null;
  }
}

export async function getAllBusinesses(): Promise<Business[]> {
  const deletedIds = new Set(getDeletedBusinessIds());
  const mergedMap = new Map<string, Business>();

  // 1. Local storage
  getLocalBusinesses().forEach(b => {
    if (b && !deletedIds.has(b.id) && b.slug !== 'bistro-paris' && b.slug !== 'clinica-estetica') {
      mergedMap.set(b.id, b);
    }
  });

  // 2. Fetch from backend API
  try {
    const res = await fetch('/api/businesses');
    if (res.ok) {
      const serverList: Business[] = await res.json();
      serverList.forEach(b => {
        if (b && !deletedIds.has(b.id) && b.slug !== 'bistro-paris' && b.slug !== 'clinica-estetica') {
          mergedMap.set(b.id, b);
          saveLocalBusiness(b);
        }
      });
    }
  } catch (err) {
    console.warn('API fetch warning:', err);
  }

  // 3. Fetch from Firestore
  try {
    const snapPromise = getDocs(collection(db, 'businesses'));
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    const snap = await Promise.race([snapPromise, timeout]);
    if (snap) {
      snap.docs.forEach(d => {
        const b = { id: d.id, ...d.data() } as Business;
        if (b && !deletedIds.has(b.id) && b.slug !== 'bistro-paris' && b.slug !== 'clinica-estetica') {
          mergedMap.set(b.id, b);
          saveLocalBusiness(b);
        }
      });
    }
  } catch (err) {
    // Expected if Firestore is offline or unprovisioned
  }

  return Array.from(mergedMap.values());
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  const path = 'businesses';

  const mergeAndNotify = (firestoreList: Business[] = []) => {
    const deletedIds = new Set(getDeletedBusinessIds());
    const local = getLocalBusinesses();
    const map = new Map<string, Business>();
    local.forEach(b => {
      if (b && !deletedIds.has(b.id) && b.slug !== 'bistro-paris' && b.slug !== 'clinica-estetica') {
        map.set(b.id, b);
      }
    });
    firestoreList.forEach(b => {
      if (b && !deletedIds.has(b.id) && b.slug !== 'bistro-paris' && b.slug !== 'clinica-estetica') {
        map.set(b.id, b);
      }
    });
    const merged = Array.from(map.values());
    callback(merged);
  };

  // Immediate dispatch of cached / local businesses
  mergeAndNotify();

  // 1. Sync from Global Cloud Store (ensures Vercel & mobile get latest data instantly)
  const syncFromCloud = async () => {
    try {
      const cloudData = await fetchGlobalCloudData();
      if (cloudData && Array.isArray(cloudData.businesses) && cloudData.businesses.length > 0) {
        const deletedIds = new Set(getDeletedBusinessIds());
        const validList = cloudData.businesses.filter(b =>
          b &&
          !deletedIds.has(b.id) &&
          b.slug !== 'bistro-paris' &&
          b.slug !== 'clinica-estetica'
        );
        validList.forEach(b => saveLocalBusiness(b));
        mergeAndNotify(validList);
      }
    } catch (err) {}
  };
  syncFromCloud();
  const cloudPollerInterval = setInterval(syncFromCloud, 3500);

  // Fetch backend API to ensure server-synced businesses are included immediately
  fetch('/api/businesses')
    .then(res => res.ok ? res.json() : [])
    .then((serverList: Business[]) => {
      if (Array.isArray(serverList) && serverList.length > 0) {
        const deletedIds = new Set(getDeletedBusinessIds());
        const validList = serverList.filter(b => 
          b && 
          !deletedIds.has(b.id) && 
          b.slug !== 'bistro-paris' && 
          b.slug !== 'clinica-estetica'
        );
        validList.forEach(b => saveLocalBusiness(b));
        mergeAndNotify(validList);
      }
    })
    .catch(() => {});

  const handleLocalUpdate = () => {
    mergeAndNotify(lastFirestoreDocs);
  };
  window.addEventListener('reputaflow_businesses_updated', handleLocalUpdate);

  let lastFirestoreDocs: Business[] = [];
  const unsubscribe = onSnapshot(
    collection(db, path),
    (snap) => {
      const deletedIds = new Set(getDeletedBusinessIds());
      lastFirestoreDocs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Business))
        .filter(b => b && !deletedIds.has(b.id) && b.slug !== 'bistro-paris' && b.slug !== 'clinica-estetica');
      lastFirestoreDocs.forEach(b => saveLocalBusiness(b));
      mergeAndNotify(lastFirestoreDocs);
    },
    (err) => {
      console.warn('subscribeBusinesses snapshot warning (operating with local and server cache):', err);
      mergeAndNotify(lastFirestoreDocs);
    }
  );

  return () => {
    clearInterval(cloudPollerInterval);
    window.removeEventListener('reputaflow_businesses_updated', handleLocalUpdate);
    unsubscribe();
  };
}

export async function createBusiness(data: Omit<Business, 'id'>, customId?: string): Promise<string> {
  const path = 'businesses';
  const targetId = customId || `biz_${Date.now().toString(36)}`;
  const payload = sanitizeForFirestore({ 
    ...data, 
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString() 
  });

  // 1. Firestore (Authoritative)
  try {
    await setDoc(doc(db, path, targetId), payload);
  } catch (err) {
    console.error('Failed to create business in Firestore', err);
    throw err;
  }
  
  // 2. Local
  saveLocalBusiness({ id: targetId, ...payload } as Business);
  return targetId;
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const path = `businesses/${id}`;
  const payload = sanitizeForFirestore({
    ...data,
    updatedAt: new Date().toISOString()
  });

  // 1. Update locally first
  const localList = getLocalBusinesses();
  const existing = localList.find(b => b.id === id);
  if (existing) {
    saveLocalBusiness({ ...existing, ...payload });
  }

  // 2. Sync to Global Cloud Store (makes changes instantly available across all devices, mobile, Vercel)
  pushGlobalCloudData({ businesses: getLocalBusinesses() }).catch(() => {});

  // 3. Sync to Backend API
  try {
    await fetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (apiErr) {
    console.warn('Backend API business update warning:', apiErr);
  }

  // 4. Safe upsert to Firestore (handles existing and non-existing docs)
  try {
    const updatePromise = setDoc(doc(db, 'businesses', id), payload, { merge: true });
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore update timeout')), 4000)
    );
    await Promise.race([updatePromise, timeout]);
  } catch (err) {
    console.warn('Firestore update warning (business updated locally and in cloud):', err);
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  // 1. Mark as permanently deleted and remove locally
  removeLocalBusiness(id);

  // 2. Sync to Global Cloud Store
  pushGlobalCloudData({ businesses: getLocalBusinesses() }).catch(() => {});

  // 3. Sync to Backend API
  try {
    await fetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  } catch (apiErr) {
    console.warn('Backend API business deletion warning:', apiErr);
  }

  // 4. Attempt Firestore deletion (non-blocking, timeout guarded)
  try {
    const delPromise = deleteDoc(doc(db, 'businesses', id));
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore delete timeout')), 2500)
    );
    await Promise.race([delPromise, timeout]);
  } catch (err) {
    console.warn('Firestore delete warning (removed locally and on server):', err);
  }
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
// REVIEWS & FEEDBACK
// ==========================================

export async function submitReview(
  data: Omit<Review, 'id' | 'createdAt'>
): Promise<{ reviewId: string }> {
  const path = 'reviews';
  const targetId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const payload: any = sanitizeForFirestore({
    ...data,
    id: targetId,
    createdAt: now,
    merchantId: data.businessId,
  });

  // 1. Save locally and notify immediately (< 5ms)
  saveLocalReview(payload);
  notifyDataChanged();

  // 2. If customer info was provided, upsert Customer in CRM
  if (data.customerName || data.customerPhone) {
    try {
      await upsertCustomerByPhone({
        businessId: data.businessId,
        name: data.customerName || 'Cliente',
        phone: data.customerPhone || '',
        email: data.customerEmail || '',
        rating: data.rating,
        status: data.rating >= 4 ? 'active' : 'in_recovery',
        internalNotes: `Avaliação de ${data.rating} estrelas via ${data.channel || 'QR'}`
      });
    } catch (custErr) {
      console.warn('Customer auto-creation warning in submitReview:', custErr);
    }
  }

  // 3. Directly WRITE TO FIRESTORE with graceful timeout
  try {
    const fsPromise = setDoc(doc(db, path, targetId), payload);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timeout')), 3000)
    );
    await Promise.race([fsPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Firestore write warning in submitReview:', err);
  }

  // 4. Background auxiliary sync
  pushGlobalCloudData({
    reviews: getLocalReviews(),
    customers: getLocalCustomers()
  }).catch(() => {});

  try {
    fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {}

  return { reviewId: targetId };
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
  const custId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  // 1. Create or update Customer locally & in Firestore
  const customerId = await upsertCustomerByPhone({
    businessId: params.businessId,
    name: params.customerName,
    phone: params.customerPhone,
    email: params.customerEmail,
    rating: params.rating,
    status: 'in_recovery',
    internalNotes: `Feedback de insatisfação (${params.rating} estrelas): ${params.question1.slice(0, 120)}`
  });

  // 2. Create Feedback document locally
  const feedbackPayload: any = sanitizeForFirestore({
    id: fbId,
    businessId: params.businessId,
    merchantId: params.businessId,
    reviewId: params.reviewId,
    customerId: customerId || custId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    rating: params.rating,
    question1: params.question1,
    question2: params.question2,
    question3WantsContact: params.question3WantsContact,
    createdAt: now
  });
  saveLocalFeedback(feedbackPayload);

  // 3. Create Recovery Case document locally
  const casePayload: any = sanitizeForFirestore({
    id: caseId,
    businessId: params.businessId,
    merchantId: params.businessId,
    customerId: customerId || custId,
    reviewId: params.reviewId,
    feedbackId: fbId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail || '',
    rating: params.rating,
    complaint: params.question1,
    status: 'novo',
    priority: params.rating <= 2 ? 'urgente' : 'media',
    assignedTo: '',
    history: [
      {
        id: `hist_${Date.now()}`,
        action: 'Caso de recuperação aberto automaticamente via avaliação',
        timestamp: now,
        userName: 'Sistema ReputaFlow'
      }
    ],
    createdAt: now,
    updatedAt: now
  });
  saveLocalRecoveryCase(casePayload);

  notifyDataChanged();

  // 4. WRITE DIRECTLY TO FIRESTORE with graceful timeout
  try {
    const fsPromise = Promise.all([
      setDoc(doc(db, 'feedback', fbId), feedbackPayload),
      setDoc(doc(db, 'recovery_cases', caseId), casePayload)
    ]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timeout')), 3000)
    );
    await Promise.race([fsPromise, timeoutPromise]);
  } catch (fsErr) {
    console.warn('Firestore write warning for feedback and recovery case:', fsErr);
  }

  // 5. Background auxiliary sync
  pushGlobalCloudData({
    feedback: getLocalFeedback(),
    recoveryCases: getLocalRecoveryCases(),
    customers: getLocalCustomers()
  }).catch(() => {});

  try {
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackPayload)
    }).catch(() => {});
    fetch('/api/recovery_cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(casePayload)
    }).catch(() => {});
  } catch {}

  return { feedbackId: fbId, caseId, customerId: customerId || custId };
}

export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const filterAndSort = (list: Review[]) => {
    const filtered = list.filter(r => isMatchingBusiness(r.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  // Immediate dispatch of current local state
  callback(filterAndSort(getLocalReviews()));

  const emitMerged = () => {
    callback(filterAndSort(getLocalReviews()));
  };

  const handleUpdate = () => emitMerged();
  window.addEventListener('reputaflow_data_updated', handleUpdate);

  // Firestore onSnapshot listener with automatic bi-directional healing & sync
  const path = 'reviews';
  const q = businessId 
    ? query(collection(db, path), where('businessId', '==', businessId))
    : collection(db, path);

  const unFs = onSnapshot(
    q,
    (snap) => {
      // Create a map of ALL existing local reviews to avoid wiping other business data
      const localReviews = getLocalReviews();
      const localMap = new Map<string, Review>();
      localReviews.forEach(loc => {
        if (loc.id) localMap.set(loc.id, loc);
      });

      // Update/add items from remote Firestore that belong to this business
      const remoteMapOfCurrentBusiness = new Map<string, Review>();
      snap.docs.forEach(d => {
        const item = { id: d.id, ...d.data() } as Review;
        localMap.set(d.id, item);
        remoteMapOfCurrentBusiness.set(d.id, item);
      });

      // If this device has any local reviews for THIS business not yet in Firestore, auto-heal and push them!
      localReviews.forEach(loc => {
        if (loc.id && isMatchingBusiness(loc.businessId, businessId) && !remoteMapOfCurrentBusiness.has(loc.id)) {
          // Sync to Firestore
          setDoc(doc(db, 'reviews', loc.id), sanitizeForFirestore({
            ...loc,
            merchantId: loc.businessId || businessId // Ensure both keys exist
          })).catch(() => {});
          remoteMapOfCurrentBusiness.set(loc.id, loc);
          localMap.set(loc.id, loc);
        }
      });

      const mergedAll = Array.from(localMap.values());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_REVIEWS, JSON.stringify(mergedAll));
      } catch (e) {}

      callback(filterAndSort(mergedAll));
    },
    (err) => {
      console.warn('Firestore reviews subscription warning:', err);
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('reputaflow_data_updated', handleUpdate);
    unFs();
  };
}

export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  const filterAndSort = (list: Feedback[]) => {
    const filtered = list.filter(f => isMatchingBusiness(f.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getLocalFeedback()));

  const emitMerged = () => {
    callback(filterAndSort(getLocalFeedback()));
  };

  const handleUpdate = () => emitMerged();
  window.addEventListener('reputaflow_data_updated', handleUpdate);

  const path = 'feedback';
  const q = businessId 
    ? query(collection(db, path), where('businessId', '==', businessId))
    : collection(db, path);

  const unFs = onSnapshot(
    q,
    (snap) => {
      const localFeedback = getLocalFeedback();
      const localMap = new Map<string, Feedback>();
      localFeedback.forEach(loc => {
        if (loc.id) localMap.set(loc.id, loc);
      });

      const remoteMapOfCurrentBusiness = new Map<string, Feedback>();
      snap.docs.forEach(d => {
        const item = { id: d.id, ...d.data() } as Feedback;
        localMap.set(d.id, item);
        remoteMapOfCurrentBusiness.set(d.id, item);
      });

      // Auto-heal local feedback to Firestore
      localFeedback.forEach(loc => {
        if (loc.id && isMatchingBusiness(loc.businessId, businessId) && !remoteMapOfCurrentBusiness.has(loc.id)) {
          setDoc(doc(db, 'feedback', loc.id), sanitizeForFirestore({
            ...loc,
            merchantId: loc.businessId || businessId
          })).catch(() => {});
          remoteMapOfCurrentBusiness.set(loc.id, loc);
          localMap.set(loc.id, loc);
        }
      });

      const mergedAll = Array.from(localMap.values());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_FEEDBACK, JSON.stringify(mergedAll));
      } catch (e) {}

      callback(filterAndSort(mergedAll));
    },
    (err) => {
      console.warn('Firestore feedback subscription warning:', err);
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('reputaflow_data_updated', handleUpdate);
    unFs();
  };
}

// ==========================================
// CUSTOMERS (CRM)
// ==========================================

export async function upsertCustomerByPhone(params: {
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  rating: number;
  status: Customer['status'];
  internalNotes?: string;
}): Promise<string> {
  const path = 'customers';
  const now = new Date().toISOString();

  // 1. Check local customers
  const localList = getLocalCustomers();
  const existingLocal = localList.find(
    c => isMatchingBusiness(c.businessId, params.businessId) && c.phone && params.phone && c.phone.replace(/\D/g, '') === params.phone.replace(/\D/g, '')
  );

  const targetId = existingLocal?.id || `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const currentCount = existingLocal ? (existingLocal.reviewsCount || 1) + 1 : 1;
  const currentAvg = existingLocal
    ? Number((((existingLocal.avgRating || params.rating) * (currentCount - 1) + params.rating) / currentCount).toFixed(1))
    : params.rating;

  const customerPayload: any = sanitizeForFirestore({
    id: targetId,
    businessId: params.businessId,
    merchantId: params.businessId,
    name: params.name || existingLocal?.name || 'Cliente',
    phone: params.phone || existingLocal?.phone || '',
    email: params.email || existingLocal?.email || '',
    reviewsCount: currentCount,
    lastReviewAt: now,
    avgRating: currentAvg,
    status: params.status || existingLocal?.status || 'in_recovery',
    internalNotes: params.internalNotes || existingLocal?.internalNotes || '',
    lastInteractionAt: now,
    createdAt: existingLocal?.createdAt || now,
    updatedAt: now
  });

  // Save locally and notify immediately
  saveLocalCustomer(customerPayload);
  notifyDataChanged();

  // Background sync (non-blocking)
  Promise.resolve().then(async () => {
    pushGlobalCloudData({ customers: getLocalCustomers() }).catch(() => {});

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e) {}

    try {
      await setDoc(doc(db, path, targetId), customerPayload, { merge: true });
    } catch (fsErr) {}
  });

  return targetId;
}

export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  const filterAndSort = (list: Customer[]) => {
    const filtered = list.filter(c => isMatchingBusiness(c.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());
  };

  callback(filterAndSort(getLocalCustomers()));

  const emitMerged = () => {
    callback(filterAndSort(getLocalCustomers()));
  };

  const handleUpdate = () => emitMerged();
  window.addEventListener('reputaflow_data_updated', handleUpdate);

  const path = 'customers';
  const q = businessId 
    ? query(collection(db, path), where('businessId', '==', businessId))
    : collection(db, path);

  const unFs = onSnapshot(
    q,
    (snap) => {
      const localCustomers = getLocalCustomers();
      const localMap = new Map<string, Customer>();
      localCustomers.forEach(loc => {
        if (loc.id) localMap.set(loc.id, loc);
      });

      const remoteMapOfCurrentBusiness = new Map<string, Customer>();
      snap.docs.forEach(d => {
        const item = { id: d.id, ...d.data() } as Customer;
        localMap.set(d.id, item);
        remoteMapOfCurrentBusiness.set(d.id, item);
      });

      // Auto-heal local customers to Firestore
      localCustomers.forEach(loc => {
        if (loc.id && isMatchingBusiness(loc.businessId, businessId) && !remoteMapOfCurrentBusiness.has(loc.id)) {
          setDoc(doc(db, 'customers', loc.id), sanitizeForFirestore({
            ...loc,
            merchantId: loc.businessId || businessId
          }), { merge: true }).catch(() => {});
          remoteMapOfCurrentBusiness.set(loc.id, loc);
          localMap.set(loc.id, loc);
        }
      });

      const mergedAll = Array.from(localMap.values());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_CUSTOMERS, JSON.stringify(mergedAll));
      } catch (e) {}

      callback(filterAndSort(mergedAll));
    },
    (err) => {
      console.warn('Firestore customers subscription warning:', err);
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('reputaflow_data_updated', handleUpdate);
    unFs();
  };
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  const localList = getLocalCustomers();
  const existing = localList.find(c => c.id === id);
  if (existing) {
    saveLocalCustomer({ ...existing, ...data, updatedAt: new Date().toISOString() });
    pushGlobalCloudData({ customers: getLocalCustomers() }).catch(() => {});
  }

  const path = `customers/${id}`;
  try {
    await updateDoc(doc(db, 'customers', id), sanitizeForFirestore({
      ...data,
      updatedAt: new Date().toISOString()
    }));
  } catch (err) {
    console.warn('updateCustomer firestore warning:', err);
  }
  notifyDataChanged();
}

// ==========================================
// RECOVERY CASES
// ==========================================

export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  const filterAndSort = (list: RecoveryCase[]) => {
    const filtered = list.filter(c => isMatchingBusiness(c.businessId, businessId));
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getLocalRecoveryCases()));

  const emitMerged = () => {
    callback(filterAndSort(getLocalRecoveryCases()));
  };

  const handleUpdate = () => emitMerged();
  window.addEventListener('reputaflow_data_updated', handleUpdate);

  const path = 'recovery_cases';
  const q = businessId 
    ? query(collection(db, path), where('businessId', '==', businessId))
    : collection(db, path);

  const unFs = onSnapshot(
    q,
    (snap) => {
      const localCases = getLocalRecoveryCases();
      const localMap = new Map<string, RecoveryCase>();
      localCases.forEach(loc => {
        if (loc.id) localMap.set(loc.id, loc);
      });

      const remoteMapOfCurrentBusiness = new Map<string, RecoveryCase>();
      snap.docs.forEach(d => {
        const item = { id: d.id, ...d.data() } as RecoveryCase;
        localMap.set(d.id, item);
        remoteMapOfCurrentBusiness.set(d.id, item);
      });

      // Auto-heal local recovery cases to Firestore
      localCases.forEach(loc => {
        if (loc.id && isMatchingBusiness(loc.businessId, businessId) && !remoteMapOfCurrentBusiness.has(loc.id)) {
          setDoc(doc(db, 'recovery_cases', loc.id), sanitizeForFirestore({
            ...loc,
            merchantId: loc.businessId || businessId
          }), { merge: true }).catch(() => {});
          remoteMapOfCurrentBusiness.set(loc.id, loc);
          localMap.set(loc.id, loc);
        }
      });

      const mergedAll = Array.from(localMap.values());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_RECOVERY, JSON.stringify(mergedAll));
      } catch (e) {}

      callback(filterAndSort(mergedAll));
    },
    (err) => {
      console.warn('Firestore recovery cases subscription warning:', err);
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('reputaflow_data_updated', handleUpdate);
    unFs();
  };
}

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  const now = new Date().toISOString();
  const localList = getLocalRecoveryCases();
  const existing = localList.find(c => c.id === caseId);
  if (existing) {
    saveLocalRecoveryCase({
      ...existing,
      status,
      updatedAt: now,
      ...(status === 'resolvido' || status === 'cliente_recuperado' ? { resolvedAt: now } : {}),
      ...(notes ? { notes } : {})
    });
    pushGlobalCloudData({ recoveryCases: getLocalRecoveryCases() }).catch(() => {});
  }

  // If customer ID provided, sync customer status
  if (customerId) {
    let customerStatus: Customer['status'] = 'in_recovery';
    if (status === 'cliente_recuperado') customerStatus = 'recovered';
    if (status === 'resolvido') customerStatus = 'active';
    await updateCustomer(customerId, { status: customerStatus, lastInteractionAt: now });
  }

  const path = `recovery_cases/${caseId}`;
  try {
    const updateData: Record<string, any> = sanitizeForFirestore({
      status,
      updatedAt: now,
      ...(status === 'resolvido' || status === 'cliente_recuperado' ? { resolvedAt: now } : {}),
      ...(notes ? { notes } : {})
    });
    await updateDoc(doc(db, 'recovery_cases', caseId), updateData);
  } catch (err) {
    console.warn('updateRecoveryCaseStatus firestore warning:', err);
  }
  notifyDataChanged();
}

// ==========================================
// INTERACTIONS (Contact logs)
// ==========================================

export async function addInteraction(data: Omit<Interaction, 'id' | 'createdAt'>): Promise<string> {
  const id = `int_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const payload: any = sanitizeForFirestore({
    ...data,
    id,
    createdAt: new Date().toISOString(),
    merchantId: data.businessId
  });

  saveLocalInteraction(payload);
  pushGlobalCloudData({ interactions: getLocalInteractions() }).catch(() => {});

  if (data.customerId) {
    await updateCustomer(data.customerId, { lastInteractionAt: new Date().toISOString() });
  }

  const path = 'interactions';
  try {
    await setDoc(doc(db, path, id), payload);
  } catch (err) {
    console.warn('addInteraction firestore warning:', err);
  }
  notifyDataChanged();
  return id;
}

export function subscribeInteractions(businessId: string | null, callback: (items: Interaction[]) => void) {
  const filterAndSort = (list: Interaction[]) => {
    const filtered = businessId ? list.filter(i => i.businessId === businessId) : list;
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  callback(filterAndSort(getLocalInteractions()));

  const emitMerged = () => {
    callback(filterAndSort(getLocalInteractions()));
  };

  const handleUpdate = () => emitMerged();
  window.addEventListener('reputaflow_data_updated', handleUpdate);

  const path = 'interactions';
  const q = businessId 
    ? query(collection(db, path), where('businessId', '==', businessId))
    : collection(db, path);

  const unFs = onSnapshot(
    q,
    (snap) => {
      const localInteractions = getLocalInteractions();
      const localMap = new Map<string, Interaction>();
      localInteractions.forEach(loc => {
        if (loc.id) localMap.set(loc.id, loc);
      });

      snap.docs.forEach(d => {
        const item = { id: d.id, ...d.data() } as Interaction;
        localMap.set(d.id, item);
      });

      const mergedAll = Array.from(localMap.values());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_INTERACTIONS, JSON.stringify(mergedAll));
      } catch (e) {}

      callback(filterAndSort(mergedAll));
    },
    (err) => {
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('reputaflow_data_updated', handleUpdate);
    unFs();
  };
}

// ==========================================
// PLANS & SETTINGS
// ==========================================

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    price: 99,
    currency: 'BRL',
    maxBusinesses: 1,
    maxReviewsMonth: 200,
    features: [
      '1 Estabelecimento',
      'Página e QR Code de avaliação',
      'CRM de clientes essencial',
      'Gestão de casos de recuperação',
      'Filtro inteligente 1–4 estrelas'
    ],
    isActive: true
  },
  {
    id: 'plan_pro',
    name: 'Profissional',
    price: 199,
    currency: 'BRL',
    maxBusinesses: 3,
    maxReviewsMonth: 1000,
    features: [
      'Até 3 Estabelecimentos',
      'QR Codes personalizados com logo',
      'Integração direta com WhatsApp',
      'CRM completo com histórico de contactos',
      'Notificações instantâneas de feedback',
      'Relatórios e métricas de satisfação'
    ],
    isActive: true
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    price: 399,
    currency: 'BRL',
    maxBusinesses: 10,
    maxReviewsMonth: 5000,
    features: [
      'Até 10 Estabelecimentos / Franquias',
      'Acesso multiusuário para equipas',
      'Automação de follow-up pós-recuperação',
      'Exportação avançada e relatórios',
      'Suporte prioritário e onboarding dedicado'
    ],
    isActive: true
  }
];

const DEFAULT_SETTINGS: PlatformSettings = {
  id: 'global',
  platformName: 'ReputaFlow',
  supportEmail: 'suporte@reputaflow.com',
  defaultGoogleReviewInstructions:
    'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes a conhecer a qualidade do nosso atendimento.',
  allowPublicRegistration: true,
  smsEnabled: true,
  whatsappApiEnabled: true
};

export async function getPlans(): Promise<Plan[]> {
  const path = 'plans';
  try {
    const snap = await getDocs(collection(db, path));
    if (snap.empty) return DEFAULT_PLANS;
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan));
  } catch (err) {
    console.warn("Firestore error loading plans, using local fallbacks", err);
    return DEFAULT_PLANS;
  }
}

export async function savePlan(plan: Plan): Promise<void> {
  const path = `plans/${plan.id}`;
  try {
    await setDoc(doc(db, 'plans', plan.id), plan);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  const path = 'settings/global';
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as PlatformSettings;
    }
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.warn("Firestore error loading global settings, using local fallbacks", err);
    return DEFAULT_SETTINGS;
  }
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  const path = 'settings/global';
  try {
    await setDoc(doc(db, 'settings', 'global'), settings);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
