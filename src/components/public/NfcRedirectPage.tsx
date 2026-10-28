import React, { useEffect, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  extractNfcPlateId,
  extractSlugFromUrl,
  findBestMatchingPlate,
  isPlateAssignedAndActive,
  isSamePlateCode
} from '../../lib/urlHelper';
import { incrementNfcScan, mapNfcRow } from '../../lib/nfcService';
import { fetchGlobalCloudData } from '../../lib/cloudSync';
import { getBusinessBySlug, getLocalBusinesses, normalizeKey } from '../../lib/dbService';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

interface NfcRedirectPageProps {
  plateId?: string;
  onPlateResolved?: (slug: string) => void;
}

export const NfcRedirectPage: React.FC<NfcRedirectPageProps> = ({
  plateId: propPlateId,
  onPlateResolved
}) => {
  const redirectedRef = useRef(false);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const executeInstantRedirect = async () => {
      // PASSO 1: LIMPEZA DE SESSÃO E CACHE ANTERIOR ANTES DO REDIRECIONAMENTO
      try {
        localStorage.removeItem('active_tenant_slug');
        localStorage.removeItem('current_establishment_id');
        localStorage.removeItem('reputaflow_nfc_plates_cache');
        sessionStorage.clear();
      } catch {}

      const rawCode = (propPlateId || extractNfcPlateId() || '').trim();
      if (!rawCode) {
        if (!isCancelled) setNotFoundCode('vazio');
        return;
      }

      const redirectToSlug = (slug: string, scanId?: string) => {
        if (isCancelled || redirectedRef.current) return;
        const cleanSlug = String(slug || '').trim();
        if (!cleanSlug) return;
        try {
          localStorage.removeItem('active_tenant_slug');
          localStorage.removeItem('current_establishment_id');
          sessionStorage.clear();
        } catch {}
        redirectedRef.current = true;
        incrementNfcScan(scanId || cleanSlug).catch(() => {});
        window.location.replace(`/r/${encodeURIComponent(cleanSlug)}`);
      };

      const cleanCode = rawCode.toUpperCase().replace(/^#+/, '');
      const isPureNumericOrLegacyPlate = /^(?:QRC|NFC|PLACA|PLATE)?[-_#]?\d+$/i.test(rawCode);
      const normRaw = normalizeKey(rawCode);

      try {
        // 1. SE NÃO FOR CÓDIGO NUMÉRICO, PROCURA DIRETAMENTE O SLUG/ID NO SUPABASE
        if (!isPureNumericOrLegacyPlate) {
          const directBiz = await getBusinessBySlug(rawCode);
          if (directBiz && directBiz.slug) {
            redirectToSlug(directBiz.slug, directBiz.slug);
            return;
          }
        }

        // 2. FONTE ÚNICA DA VERDADE (SUPABASE): Consulta simultânea a `businesses` e `nfc_plates` sem cache
        const [supaBizRes, supaNfcRes] = await Promise.all([
          supabase.from('businesses').select('*'),
          supabase.from('nfc_plates').select('*')
        ]);

        const supaBusinesses = Array.isArray(supaBizRes.data) ? supaBizRes.data : [];
        const supaPlates = Array.isArray(supaNfcRes.data) ? supaNfcRes.data : [];

        // Verifica match direto por slug ou id nos comércios do Supabase
        const directSupaBiz = supaBusinesses.find(
          (b: any) =>
            b &&
            (normalizeKey(b.slug || '') === normRaw ||
              normalizeKey(b.id || '') === normRaw ||
              normalizeKey(b.owner_id || '') === normRaw)
        );
        if (directSupaBiz && directSupaBiz.slug) {
          redirectToSlug(directSupaBiz.slug, directSupaBiz.slug);
          return;
        }

        // Verifica match na tabela `nfc_plates` do Supabase
        if (supaPlates.length > 0) {
          const matchedNfc = findBestMatchingPlate(supaPlates, cleanCode);
          if (matchedNfc && isPlateAssignedAndActive(matchedNfc)) {
            const mapped = mapNfcRow(matchedNfc, supaBusinesses as any);
            const targetSlug =
              mapped.merchant_slug ||
              extractSlugFromUrl(mapped.redirect_url) ||
              mapped.merchant_id ||
              null;
            if (targetSlug) {
              redirectToSlug(String(targetSlug).trim(), mapped.id || cleanCode);
              return;
            }
          }
        }

        // 3. Fallback caso Supabase esteja offline: Server API + CloudSync
        const [serverPlate, cloudData] = await Promise.all([
          fetch(`/api/nfc/${encodeURIComponent(cleanCode)}?_v=${Date.now()}`, {
            cache: 'no-store'
          })
            .then(async (r) => {
              const ct = r.headers.get('content-type') || '';
              if (r.ok && ct.includes('application/json')) return await r.json();
              return null;
            })
            .catch(() => null),
          fetchGlobalCloudData(true).catch(() => null)
        ]);

        if (isCancelled || redirectedRef.current) return;

        const allKnownBusinesses = [
          ...supaBusinesses,
          ...(Array.isArray(cloudData?.businesses) ? cloudData!.businesses : []),
          ...getLocalBusinesses()
        ];

        let cloudPlate = null;
        if (cloudData && Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
          const matched = findBestMatchingPlate(cloudData.nfcPlates, cleanCode);
          if (matched && isPlateAssignedAndActive(matched)) {
            cloudPlate = mapNfcRow(matched, allKnownBusinesses);
          }
        }

        const allCandidates = [
          serverPlate ? mapNfcRow(serverPlate, allKnownBusinesses) : null,
          cloudPlate
        ].filter((p): p is NonNullable<typeof p> => Boolean(p && isPlateAssignedAndActive(p)));

        const winningPlate = findBestMatchingPlate(allCandidates, cleanCode);
        if (winningPlate && isPlateAssignedAndActive(winningPlate)) {
          const tenantSlug =
            winningPlate.merchant_slug ||
            extractSlugFromUrl(winningPlate.redirect_url) ||
            winningPlate.merchant_id ||
            null;
          if (tenantSlug) {
            redirectToSlug(String(tenantSlug).trim(), winningPlate.id || cleanCode);
            return;
          }
        }

        // Resolução automática para códigos numéricos padrões (001 -> sbk-barbershop, 002 -> mrnavalha)
        if (isPureNumericOrLegacyPlate) {
          if (isSamePlateCode(cleanCode, '001')) {
            redirectToSlug('sbk-barbershop', '001');
            return;
          }
          if (isSamePlateCode(cleanCode, '002')) {
            redirectToSlug('mrnavalha', '002');
            return;
          }
        }

        if (!isCancelled) {
          setNotFoundCode(rawCode);
        }
      } catch (err) {
        console.warn('[NfcRedirectPage resolution notice]:', err);
        if (!isCancelled) {
          setNotFoundCode(rawCode);
        }
      }
    };

    executeInstantRedirect();

    return () => {
      isCancelled = true;
    };
  }, [propPlateId, onPlateResolved]);

  // Exibe erro 404 limpo apenas se o código/slug realmente não existir
  if (notFoundCode) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-8 px-4 sm:px-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <Store className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 bg-rose-50 text-rose-700 text-[11px] font-extrabold rounded-full uppercase tracking-wider">
              Erro 404
            </span>
            <h1 className="text-xl font-extrabold text-slate-900">
              Estabelecimento não encontrado
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              Não encontrámos nenhum estabelecimento registado para o identificador{' '}
              <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono font-bold">
                {notFoundCode}
              </code>
              . Verifique se o QR Code ou link está correto.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
