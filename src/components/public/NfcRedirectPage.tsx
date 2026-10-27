import React, { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  extractNfcPlateId,
  extractSlugFromUrl,
  findBestMatchingPlate,
  isPlateAssignedAndActive
} from '../../lib/urlHelper';
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
      // Limpeza preventiva de sessão anterior (preservando cache de placas e estabelecimentos)
      try {
        localStorage.removeItem('active_tenant_slug');
        localStorage.removeItem('current_establishment_id');
        sessionStorage.clear();
      } catch {}

      // PASSO 1: BUSCA FLEXÍVEL DE PLACAS (NORMALIZAÇÃO DE CÓDIGO)
      const rawCode = (propPlateId || extractNfcPlateId() || '').trim(); // ex: "QRC0004", "004", "#004"
      if (!rawCode) {
        if (!isCancelled) {
          window.location.replace('/?error=qr_nao_atribuido');
        }
        return;
      }

      const cleanCode = rawCode.toUpperCase().replace(/^#+/, '');
      const cleanNumber = rawCode.replace(/\D/g, ''); // Extrai apenas os números (ex: "4", "004", "0004")
      const shortNumber = cleanNumber.replace(/^0+/, '') || cleanNumber; // ex: "4"
      const pad3 = shortNumber ? shortNumber.padStart(3, '0') : ''; // ex: "004"

      try {
        // Constrói filtro .or() flexível com todas as variações do código
        const orClauses = Array.from(
          new Set(
            [
              `qr_code_id.ilike.%${rawCode}%`,
              cleanNumber ? `qr_code_id.ilike.%${cleanNumber}%` : '',
              pad3 && pad3 !== cleanNumber ? `qr_code_id.ilike.%${pad3}%` : ''
            ].filter(Boolean)
          )
        ).join(',');

        // Tentativa direta na tabela `qr_plates` com relação `tenants(slug)` conforme especificação
        const { data: plate, error } = await supabase
          .from('qr_plates')
          .select('tenant_id, qr_code_id, tenants(slug)')
          .or(orClauses)
          .maybeSingle();

        // PASSO 2: VALIDAÇÃO SEGURA DO LOJISTA VINCULADO
        const joinedTenantSlug =
          (plate as any)?.tenants?.slug ||
          (Array.isArray((plate as any)?.tenants) ? (plate as any).tenants[0]?.slug : null);

        if (!error && plate && joinedTenantSlug) {
          const tenantSlug = String(joinedTenantSlug).trim();
          try {
            localStorage.removeItem('active_tenant_slug');
          } catch {}
          redirectedRef.current = true;
          incrementNfcScan(plate.qr_code_id || cleanCode).catch(() => {});
          window.location.replace(`/r/${encodeURIComponent(tenantSlug)}`);
          return;
        }

        // Caso a relação `tenants(slug)` não esteja definida no schema ou haja múltiplos registos,
        // resolvemos o `tenant_id` / `merchant_id` de forma resiliente em todas as tabelas e fontes:
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

        // B. Consulta ao Global Cloud Sync
        const cloudPromise = fetchGlobalCloudData(true)
          .then((cloudData) => {
            if (!cloudData) return null;
            const cloudBiz =
              Array.isArray(cloudData.businesses) && cloudData.businesses.length > 0
                ? cloudData.businesses
                : localBusinesses;
            if (Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
              const matched = findBestMatchingPlate(cloudData.nfcPlates, cleanCode);
              if (matched && isPlateAssignedAndActive(matched)) {
                return mapNfcRow(matched, cloudBiz);
              }
            }
            return null;
          })
          .catch(() => null);

        // C. Consulta resiliente às tabelas do Supabase (`qr_plates`, `nfc_plates`, `businesses`, `tenants`, `establishments`)
        const supabaseFallbackPromise = (async () => {
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
          const lookup = (async () => {
            let supaBizList = [...localBusinesses];
            for (const bizTable of ['businesses', 'tenants', 'establishments']) {
              try {
                const { data: bRows } = await supabase.from(bizTable).select('*');
                if (Array.isArray(bRows) && bRows.length > 0) {
                  supaBizList = [...bRows, ...supaBizList] as any;
                }
              } catch {}
            }

            // Se a query do Passo 1 já retornou `plate` com `tenant_id` preenchido, mapeia diretamente
            if (plate && plate.tenant_id) {
              const mappedDirect = mapNfcRow(plate, supaBizList);
              if (isPlateAssignedAndActive(mappedDirect)) {
                return mappedDirect;
              }
            }

            // 1. Procura em `qr_plates` com select('*')
            try {
              const { data: qrRows } = await supabase.from('qr_plates').select('*');
              if (Array.isArray(qrRows) && qrRows.length > 0) {
                const matchedQr = findBestMatchingPlate(qrRows, cleanCode);
                if (matchedQr && isPlateAssignedAndActive(matchedQr)) {
                  return mapNfcRow(matchedQr, supaBizList);
                }
              }
            } catch {}

            // 2. Procura em `nfc_plates` com select('*')
            try {
              const { data: nfcRows } = await supabase.from('nfc_plates').select('*');
              if (Array.isArray(nfcRows) && nfcRows.length > 0) {
                const matchedNfc = findBestMatchingPlate(nfcRows, cleanCode);
                if (matchedNfc && isPlateAssignedAndActive(matchedNfc)) {
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
          supabaseFallbackPromise
        ]);

        if (isCancelled || redirectedRef.current) return;

        // D. Leitura da cache local sanitizada
        const localPlate = findFastNfcPlate(cleanCode);

        // E. Seleciona o melhor registo vinculado entre todas as fontes
        const allCandidates = [
          supabasePlate,
          cloudPlate,
          serverPlate ? mapNfcRow(serverPlate, localBusinesses) : null,
          localPlate
        ].filter((p): p is NonNullable<typeof p> => Boolean(p && isPlateAssignedAndActive(p)));

        const winningPlate = findBestMatchingPlate(allCandidates, cleanCode);

        if (winningPlate && isPlateAssignedAndActive(winningPlate)) {
          const tenantSlug =
            winningPlate.merchant_slug ||
            extractSlugFromUrl(winningPlate.redirect_url) ||
            winningPlate.merchant_id ||
            null;
          const redirectUrl = winningPlate.redirect_url || null;
          const resolvedPlateId = winningPlate.id || cleanCode;

          if (tenantSlug || redirectUrl) {
            try {
              localStorage.removeItem('active_tenant_slug');
            } catch {}
            redirectedRef.current = true;
            incrementNfcScan(resolvedPlateId).catch(() => {});

            if (tenantSlug) {
              window.location.replace(`/r/${encodeURIComponent(String(tenantSlug).trim())}`);
              return;
            }

            let fullTarget = String(redirectUrl).trim();
            if (fullTarget.startsWith('/')) {
              fullTarget = window.location.origin + fullTarget;
            } else if (!/^https?:\/\//i.test(fullTarget)) {
              fullTarget = 'https://' + fullTarget;
            }
            window.location.replace(fullTarget);
            return;
          }
        }

        // PASSO 3: FALLBACK DE PLACA NÃO ATRIBUÍDA REAL
        // Só redireciona para erro se a placa realmente não existir ou se tenant_id/merchant_id for nulo
        if (!isCancelled) {
          window.location.replace('/?error=qr_nao_atribuido');
        }
      } catch (err) {
        console.warn('[NfcRedirectPage resolution notice]:', err);
        if (!isCancelled) {
          window.location.replace('/?error=qr_nao_atribuido');
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


