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
import { incrementNfcScan, findFastNfcPlate, mapNfcRow } from '../../lib/nfcService';
import { fetchGlobalCloudData } from '../../lib/cloudSync';
import { getBusinessBySlug, getLocalBusinesses, normalizeKey } from '../../lib/dbService';

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
      // PASSO 1: LIMPEZA DE SESSÃO ANTERIOR ANTES DO REDIRECIONAMENTO
      try {
        localStorage.removeItem('active_tenant_slug');
        localStorage.removeItem('current_establishment_id');
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
      const cleanNumber = rawCode.replace(/\D/g, '');
      const shortNumber = cleanNumber.replace(/^0+/, '') || cleanNumber;
      const pad3 = shortNumber ? shortNumber.padStart(3, '0') : '';
      const normRaw = normalizeKey(rawCode);

      try {
        // 1. RESOLUÇÃO DIRETA E AUTÓNOMA POR SLUG OU ID DO COMÉRCIO (/qr/[slug] -> /r/[slug])
        // Se o código não for apenas numérico (ex: /qr/barbearia-vip), procura diretamente o lojista
        const isPureNumericOrLegacyPlate = /^(?:QRC|NFC|PLACA|PLATE)?[-_#]?\d+$/i.test(rawCode);
        if (!isPureNumericOrLegacyPlate) {
          const directBiz = await getBusinessBySlug(rawCode);
          if (directBiz && directBiz.slug) {
            redirectToSlug(directBiz.slug, directBiz.slug);
            return;
          }
        }

        // 2. BUSCA FLEXÍVEL EM SUPABASE, CLOUD SYNC E API (Suporta links diretos e códigos legados)
        const orClauses = Array.from(
          new Set(
            [
              `qr_code_id.ilike.%${rawCode}%`,
              cleanNumber ? `qr_code_id.ilike.%${cleanNumber}%` : '',
              pad3 && pad3 !== cleanNumber ? `qr_code_id.ilike.%${pad3}%` : ''
            ].filter(Boolean)
          )
        ).join(',');

        const { data: plate, error } = await supabase
          .from('qr_plates')
          .select('tenant_id, qr_code_id, tenants(slug)')
          .or(orClauses)
          .maybeSingle();

        const joinedTenantSlug =
          (plate as any)?.tenants?.slug ||
          (Array.isArray((plate as any)?.tenants) ? (plate as any).tenants[0]?.slug : null);

        if (!error && plate && joinedTenantSlug) {
          redirectToSlug(String(joinedTenantSlug).trim(), plate.qr_code_id || cleanCode);
          return;
        }

        const localBusinesses = getLocalBusinesses();

        // A. Consulta ao Backend Server API
        const serverPromise = fetch(`/api/nfc/${encodeURIComponent(cleanCode)}?_v=${Date.now()}`, {
          cache: 'no-store'
        })
          .then(async (r) => {
            const ct = r.headers.get('content-type') || '';
            if (r.ok && ct.includes('application/json')) {
              return await r.json();
            }
            return null;
          })
          .catch(() => null);

        // B. Consulta ao Global Cloud Sync (Funciona em aba anónima / mobile no Vercel)
        const cloudPromise = fetchGlobalCloudData(true).catch(() => null);

        // C. Consulta às tabelas do Supabase (`businesses`, `tenants`, `establishments`, `qr_plates`, `nfc_plates`)
        const supabaseFallbackPromise = (async () => {
          const timeout = new Promise<{ bizList: any[]; plateMatch: any }>((resolve) =>
            setTimeout(() => resolve({ bizList: [], plateMatch: null }), 2200)
          );
          const lookup = (async () => {
            let supaBizList: any[] = [];
            for (const bizTable of ['businesses', 'tenants', 'establishments']) {
              try {
                const { data: bRows } = await supabase.from(bizTable).select('*');
                if (Array.isArray(bRows) && bRows.length > 0) {
                  supaBizList = [...bRows, ...supaBizList];
                }
              } catch {}
            }

            const combinedBiz = [...supaBizList, ...localBusinesses];

            if (plate && plate.tenant_id) {
              const mappedDirect = mapNfcRow(plate, combinedBiz);
              if (isPlateAssignedAndActive(mappedDirect)) {
                return { bizList: supaBizList, plateMatch: mappedDirect };
              }
            }

            try {
              const { data: qrRows } = await supabase.from('qr_plates').select('*');
              if (Array.isArray(qrRows) && qrRows.length > 0) {
                const matchedQr = findBestMatchingPlate(qrRows, cleanCode);
                if (matchedQr && isPlateAssignedAndActive(matchedQr)) {
                  return { bizList: supaBizList, plateMatch: mapNfcRow(matchedQr, combinedBiz) };
                }
              }
            } catch {}

            try {
              const { data: nfcRows } = await supabase.from('nfc_plates').select('*');
              if (Array.isArray(nfcRows) && nfcRows.length > 0) {
                const matchedNfc = findBestMatchingPlate(nfcRows, cleanCode);
                if (matchedNfc && isPlateAssignedAndActive(matchedNfc)) {
                  return { bizList: supaBizList, plateMatch: mapNfcRow(matchedNfc, combinedBiz) };
                }
              }
            } catch {}

            return { bizList: supaBizList, plateMatch: null };
          })();

          return Promise.race([lookup, timeout]);
        })();

        const [serverPlate, cloudData, supaResult] = await Promise.all([
          serverPromise,
          cloudPromise,
          supabaseFallbackPromise
        ]);

        if (isCancelled || redirectedRef.current) return;

        // Reúne todos os comércios conhecidos (CloudSync + Supabase + Local)
        const allKnownBusinesses = [
          ...(Array.isArray(cloudData?.businesses) ? cloudData!.businesses : []),
          ...(Array.isArray(supaResult?.bizList) ? supaResult.bizList : []),
          ...localBusinesses
        ];

        // Verifica se o código na URL corresponde diretamente ao slug, id ou nome de algum comércio
        const directMatchedBiz = allKnownBusinesses.find(
          (b: any) =>
            b &&
            (normalizeKey(b.slug || '') === normRaw ||
              normalizeKey(b.id || '') === normRaw ||
              normalizeKey(b.ownerId || b.owner_id || '') === normRaw)
        );
        if (directMatchedBiz && directMatchedBiz.slug) {
          redirectToSlug(directMatchedBiz.slug, directMatchedBiz.slug);
          return;
        }

        // Verifica placas em CloudSync, Supabase, Server e Cache Local
        let cloudPlate = null;
        if (cloudData && Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
          const matched = findBestMatchingPlate(cloudData.nfcPlates, cleanCode);
          if (matched && isPlateAssignedAndActive(matched)) {
            cloudPlate = mapNfcRow(matched, allKnownBusinesses);
          }
        }

        const localPlate = findFastNfcPlate(cleanCode);

        const allCandidates = [
          supaResult?.plateMatch || null,
          cloudPlate,
          serverPlate ? mapNfcRow(serverPlate, allKnownBusinesses) : null,
          localPlate
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

        // Resolução automática para códigos numéricos legados (ex: /qr/001 -> 1º comércio cadastrado, /qr/002 -> mrnavalha)
        if (isPureNumericOrLegacyPlate) {
          if (isSamePlateCode(cleanCode, '002')) {
            redirectToSlug('mrnavalha', 'mrnavalha');
            return;
          }
          if (isSamePlateCode(cleanCode, '001')) {
            const customMerchant = allKnownBusinesses.find(
              (b: any) => b && b.slug && String(b.slug).toLowerCase() !== 'mrnavalha'
            );
            const fallbackFirst = customMerchant || allKnownBusinesses.find((b: any) => b && b.slug);
            if (fallbackFirst && fallbackFirst.slug) {
              redirectToSlug(fallbackFirst.slug, fallbackFirst.slug);
              return;
            }
          }
        }

        // PASSO 3: Se o slug/código não existir em nenhuma fonte, exibe página 404 limpa
        // NUNCA faz fallback para Mr. Navalha nem redireciona para a tela de login
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
