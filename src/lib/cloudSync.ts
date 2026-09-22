import { Business, Review, Feedback, RecoveryCase, Customer, Interaction, PlatformSettings } from '../types';

const CLOUD_SYNC_OBJECT_ID = 'ff808181a09d98f701a0c414460b6189';
const CLOUD_SYNC_URL = `https://api.restful-api.dev/objects/${CLOUD_SYNC_OBJECT_ID}`;

export interface CloudSyncPayload {
  businesses: Business[];
  reviews?: Review[];
  feedback?: Feedback[];
  customers?: Customer[];
  recoveryCases?: RecoveryCase[];
  interactions?: Interaction[];
  settings?: PlatformSettings;
  lastUpdated: string;
}

let cachedCloudData: CloudSyncPayload | null = null;
let lastFetchTime = 0;
let syncInProgress = false;
let pendingDataToSync: Partial<CloudSyncPayload> | null = null;
let pushDebounceTimer: any = null;

export async function fetchGlobalCloudData(forceRefresh = false): Promise<CloudSyncPayload | null> {
  const now = Date.now();
  if (!forceRefresh && cachedCloudData && now - lastFetchTime < 3000) {
    return cachedCloudData;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(CLOUD_SYNC_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const result = await res.json();
      if (result && result.data && Array.isArray(result.data.businesses)) {
        cachedCloudData = result.data as CloudSyncPayload;
        lastFetchTime = Date.now();
        return cachedCloudData;
      }
    }
  } catch (err) {
    // Return cached data if available on failure
    if (cachedCloudData) return cachedCloudData;
  }
  return null;
}

// Helper to merge arrays uniquely by ID
function mergeById<T extends { id?: string }>(incoming?: T[], base?: T[]): T[] {
  const map = new Map<string, T>();
  (base || []).forEach(item => { if (item?.id) map.set(item.id, item); });
  (incoming || []).forEach(item => { if (item?.id) map.set(item.id, item); });
  return Array.from(map.values());
}

export async function pushGlobalCloudData(payload: Partial<CloudSyncPayload>): Promise<void> {
  pendingDataToSync = {
    ...pendingDataToSync,
    ...payload,
    businesses: payload.businesses || pendingDataToSync?.businesses,
    reviews: payload.reviews || pendingDataToSync?.reviews,
    feedback: payload.feedback || pendingDataToSync?.feedback,
    customers: payload.customers || pendingDataToSync?.customers,
    recoveryCases: payload.recoveryCases || pendingDataToSync?.recoveryCases,
    interactions: payload.interactions || pendingDataToSync?.interactions
  };

  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
  }

  pushDebounceTimer = setTimeout(async () => {
    if (syncInProgress || !pendingDataToSync) return;
    syncInProgress = true;
    const dataToSend = pendingDataToSync;
    pendingDataToSync = null;

    try {
      const existing = await fetchGlobalCloudData(true);

      const mergedPayload: CloudSyncPayload = {
        businesses: dataToSend.businesses ? mergeById(dataToSend.businesses, existing?.businesses) : (existing?.businesses || []),
        reviews: dataToSend.reviews ? mergeById(dataToSend.reviews, existing?.reviews) : (existing?.reviews || []),
        feedback: dataToSend.feedback ? mergeById(dataToSend.feedback, existing?.feedback) : (existing?.feedback || []),
        customers: dataToSend.customers ? mergeById(dataToSend.customers, existing?.customers) : (existing?.customers || []),
        recoveryCases: dataToSend.recoveryCases ? mergeById(dataToSend.recoveryCases, existing?.recoveryCases) : (existing?.recoveryCases || []),
        interactions: dataToSend.interactions ? mergeById(dataToSend.interactions, existing?.interactions) : (existing?.interactions || []),
        settings: dataToSend.settings || existing?.settings,
        lastUpdated: new Date().toISOString()
      };

      cachedCloudData = mergedPayload;
      lastFetchTime = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      await fetch(CLOUD_SYNC_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: 'reputaflow_v1_businesses',
          data: mergedPayload
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (err) {
      console.warn('Global cloud sync push error:', err);
    } finally {
      syncInProgress = false;
      if (pendingDataToSync) {
        pushGlobalCloudData({});
      }
    }
  }, 250);
}


