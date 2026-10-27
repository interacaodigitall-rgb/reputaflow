import React, { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { extractNfcPlateId, extractSlugFromUrl, findBestMatchingPlate } from '../../lib/urlHelper';
import { incrementNfcScan, findFastNfcPlate, mapNfcRow } from '../../lib/nfcService';
import { fetchGlobalCloudData } from '../../lib/cloudSync';
import { getLocalBusinesses } from '../../lib/dbService';

interface NfcRedirectPageProps {
  plateId?: string;
  onPlateResolved?: (slug: string) => void;
}

export const NfcRedirectPage: React.FC<NfcRedirectPageProps> = ({
  plateId: propPlateId,
  onPlateResolved
}) => {
  const redirectedRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const executeInstantRedirect = async () => {
      // PASSO 1: LIMPEZA DE SESSÃO ANTERIOR ANTES DO REDIRECIONAMENTO
      // Nota: NUNCA apagar 'reputaflow_nfc_plates_cache' ou 'reputaflow_persisted_businesses_v1'
      try {
        localStorage.removeItem('active_tenant_slug');
        localStorage.removeItem('current_establishment_id');
        sessionStorage.clear();
      } catch {}

      // 1. Extrai e normaliza o código em maiúsculas (ex: QRC0004)
      const rawCode = (propPlateId || extractNfcPlateId() || '').trim();
      const cleanCode = rawCode.toUpperCase();

      if (!cleanCode) {
        if (!isCancelled) {
          window.location.replace(`/?error=qr_nao_atribuido&_v=${Date.now()}`);
        }
        return;
      }

      try {
        const localBusinesses = getLocalBusinesses();

        // A. Consulta ao Backend Server API (verificando content-type JSON para evitar HTML rewrite na Vercel)
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

        // B. Consulta ao Global Cloud Sync (funciona na Vercel, telemóvel e desktop em tempo real)
        const cloudPromise = fetchGlobalCloudData(true)
          .then((cloudData) => {
            if (!cloudData) return null;
            const cloudBiz = Array.isArray(cloudData.businesses) && cloudData.businesses.length > 0
              ? cloudData.businesses
              : localBusinesses;
            if (Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
              const matched = findBestMatchingPlate(cloudData.nfcPlates, cleanCode);
              if (matched) {
                return mapNfcRow(matched, cloudBiz);
              }
            }
            return null;
          })
          .catch(() => null);

        // C. Consulta segura ao Supabase usando .select('*') (evita erro HTTP 400 se colunas/FKs diferirem)
        const supabasePromise = (async () => {
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800));
          const lookup = (async () => {
            let supaBizList = localBusinesses;
            try {
              const { data: bRows } = await supabase.from('businesses').select('*');
              if (Array.isArray(bRows) && bRows.length > 0) {
                supaBizList = bRows as any;
              }
            } catch {}

            // 1. Tenta tabela qr_plates
            try {
              const { data: qrRows, error: qrErr } = await supabase.from('qr_plates').select('*');
              if (!qrErr && Array.isArray(qrRows) && qrRows.length > 0) {
                const matchedQr = findBestMatchingPlate(qrRows, cleanCode);
                if (matchedQr) {
                  return mapNfcRow(matchedQr, supaBizList);
                }
              }
            } catch {}

            // 2. Tenta tabela nfc_plates
            try {
              const { data: nfcRows, error: nfcErr } = await supabase.from('nfc_plates').select('*');
              if (!nfcErr && Array.isArray(nfcRows) && nfcRows.length > 0) {
                const matchedNfc = findBestMatchingPlate(nfcRows, cleanCode);
                if (matchedNfc) {
                  return mapNfcRow(matchedNfc, supaBizList);
                }
              }
            } catch {}

            return null;
          })();

          return Promise.race([lookup, timeout]);
        })();

        const [serverPlate, cloudPlate, supabasePlate] = await Promise.all([
          serverPromise,
          cloudPromise,
          supabasePromise
        ]);

        if (isCancelled || redirectedRef.current) return;

        // D. Leitura da cache local sanitizada
        const localPlate = findFastNfcPlate(cleanCode);

        // E. Seleciona o melhor registo ativo entre todas as fontes (priorizando comércio atribuído e timestamp mais recente)
        const allCandidates = [
          supabasePlate,
          cloudPlate,
          serverPlate ? mapNfcRow(serverPlate, localBusinesses) : null,
          localPlate
        ].filter((p): p is NonNullable<typeof p> => Boolean(p && String(p.status || '').toLowerCase() === 'active'));

        const winningPlate = findBestMatchingPlate(allCandidates, cleanCode);

        let tenantSlug: string | null = null;
        let redirectUrl: string | null = null;
        let resolvedPlateId = cleanCode;

        if (winningPlate && String(winningPlate.status || '').toLowerCase() === 'active') {
          tenantSlug = winningPlate.merchant_slug || extractSlugFromUrl(winningPlate.redirect_url) || null;
          redirectUrl = winningPlate.redirect_url || null;
          resolvedPlateId = winningPlate.id || cleanCode;
        }

        // PASSO 2: FORÇAR PARÂMETRO ÚNICO DE ROTA (CACHE-BUSTING)
        if (tenantSlug || redirectUrl) {
          redirectedRef.current = true;
          incrementNfcScan(resolvedPlateId).catch(() => {});

          if (tenantSlug) {
            const targetUrl = `/r/${encodeURIComponent(tenantSlug)}?_v=${Date.now()}`;
            window.location.replace(targetUrl);
            return;
          }

          let fullTarget = String(redirectUrl).trim();
          fullTarget += (fullTarget.includes('?') ? '&' : '?') + `_v=${Date.now()}`;
          if (fullTarget.startsWith('/')) {
            fullTarget = window.location.origin + fullTarget;
          } else if (!/^https?:\/\//i.test(fullTarget)) {
            fullTarget = 'https://' + fullTarget;
          }
          window.location.replace(fullTarget);
          return;
        }

        // Se não encontrar ou não estiver atribuído, redireciona para página de erro limpa
        if (!isCancelled) {
          window.location.replace(`/?error=qr_nao_atribuido&_v=${Date.now()}`);
        }
      } catch (err) {
        console.warn('[NfcRedirectPage resolution notice]:', err);
        if (!isCancelled) {
          window.location.replace(`/?error=qr_nao_atribuido&_v=${Date.now()}`);
        }
      }
    };

    executeInstantRedirect();

    return () => {
      isCancelled = true;
    };
  }, [propPlateId, onPlateResolved]);

  // Retorna null imediatamente para que NENHUM HTML de loading seja pintado na tela
  return null;
};

