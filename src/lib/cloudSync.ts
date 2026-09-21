import { Business, Review, Feedback, RecoveryCase, PlatformSettings } from '../types';

const CLOUD_SYNC_OBJECT_ID = 'ff808181a09d98f701a0c414460b6189';
const CLOUD_SYNC_URL = `https://api.restful-api.dev/objects/${CLOUD_SYNC_OBJECT_ID}`;

interface CloudSyncPayload {
  businesses: Business[];
  reviews?: Review[];
  feedback?: Feedback[];
  recoveryCases?: RecoveryCase[];
  settings?: PlatformSettings;
  lastUpdated: string;
}

let syncInProgress = false;
let pendingDataToSync: CloudSyncPayload | null = null;

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
    pendingDataToSync = {
      businesses: payload.businesses || [],
      reviews: payload.reviews || [],
      feedback: payload.feedback || [],
      recoveryCases: payload.recoveryCases || [],
      settings: payload.settings,
      lastUpdated: new Date().toISOString()
    };
    return;
  }

  syncInProgress = true;
  try {
    const existing = await fetchGlobalCloudData();
    const mergedPayload: CloudSyncPayload = {
      businesses: payload.businesses || existing?.businesses || [],
      reviews: payload.reviews || existing?.reviews || [],
      feedback: payload.feedback || existing?.feedback || [],
      recoveryCases: payload.recoveryCases || existing?.recoveryCases || [],
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
