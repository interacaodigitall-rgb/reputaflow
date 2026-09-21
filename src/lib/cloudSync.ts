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

let syncInProgress = false;
let pendingDataToSync: Partial<CloudSyncPayload> | null = null;

export async function fetchGlobalCloudData(): Promise<CloudSyncPayload | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(CLOUD_SYNC_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const result = await res.json();
      if (result && result.data && Array.isArray(result.data.businesses)) {
        return result.data as CloudSyncPayload;
      }
    }
  } catch (err) {
    console.warn('Global cloud sync fetch error:', err);
  }
  return null;
}

export async function pushGlobalCloudData(payload: Partial<CloudSyncPayload>): Promise<void> {
  if (syncInProgress) {
    pendingDataToSync = { ...pendingDataToSync, ...payload };
    return;
  }

  syncInProgress = true;
  try {
    const existing = await fetchGlobalCloudData();

    // Helper to merge arrays uniquely by ID
    const mergeById = <T extends { id?: string }>(incoming?: T[], base?: T[]): T[] => {
      const map = new Map<string, T>();
      (base || []).forEach(item => { if (item?.id) map.set(item.id, item); });
      (incoming || []).forEach(item => { if (item?.id) map.set(item.id, item); });
      return Array.from(map.values());
    };

    const mergedPayload: CloudSyncPayload = {
      businesses: payload.businesses ? mergeById(payload.businesses, existing?.businesses) : (existing?.businesses || []),
      reviews: payload.reviews ? mergeById(payload.reviews, existing?.reviews) : (existing?.reviews || []),
      feedback: payload.feedback ? mergeById(payload.feedback, existing?.feedback) : (existing?.feedback || []),
      customers: payload.customers ? mergeById(payload.customers, existing?.customers) : (existing?.customers || []),
      recoveryCases: payload.recoveryCases ? mergeById(payload.recoveryCases, existing?.recoveryCases) : (existing?.recoveryCases || []),
      interactions: payload.interactions ? mergeById(payload.interactions, existing?.interactions) : (existing?.interactions || []),
      settings: payload.settings || existing?.settings,
      lastUpdated: new Date().toISOString()
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
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
      const next = pendingDataToSync;
      pendingDataToSync = null;
      pushGlobalCloudData(next);
    }
  }
}

