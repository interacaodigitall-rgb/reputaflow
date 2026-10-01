export type NfcPlateStatus = 'active' | 'inactive';

export interface NfcPlate {
  id: string; // Serial code (e.g. '001', '002', 'NFC-001')
  status: NfcPlateStatus;
  merchant_id?: string | null;
  redirect_url?: string | null;
  scan_count: number;
  created_at: string;
  updated_at?: string;
  // Enriched optional client property
  merchant_name?: string;
  merchant_slug?: string;
  merchant_logo_url?: string;
}

export interface CreateNfcBatchOptions {
  quantity: number;
  prefix?: string;
  startNumber?: number;
  padDigits?: number;
}
