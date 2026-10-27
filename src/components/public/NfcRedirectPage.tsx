import React, { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { extractNfcPlateId, extractSlugFromUrl } from '../../lib/urlHelper';
import { incrementNfcScan, findFastNfcPlate } from '../../lib/nfcService';

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
      try {
        localStorage.removeItem('active_tenant_slug');
        localStorage.removeItem('current_establishment_id');
        localStorage.removeItem('reputaflow_nfc_plates_cache');
        sessionStorage.clear();
      } catch {}

      // 1. Extrai e normaliza o código em maiúsculas (ex: QRC0004)
      const rawCode = (propPlateId || extractNfcPlateId() || '').trim();
      const cleanCode = rawCode.toUpperCase();
      const stripped = cleanCode.replace(/^(?:QRC|NFC)-?/i, '');
      const numOnly = stripped.replace(/^0+/, '') || '0';
      const norm3 = numOnly.padStart(3, '0');
      const norm4 = numOnly.padStart(4, '0');
      const qrc3 = `QRC${norm3}`;
      const qrc4 = `QRC${norm4}`;

      if (!cleanCode) {
        if (!isCancelled) {
          window.location.replace(`/?error=qr_nao_atribuido&_v=${Date.now()}`);
        }
        return;
      }

      // 2. Consulta assíncrona prioritária no Servidor & Supabase (garante dados reais no mobile sem cache antigo)
      try {
        let tenantSlug: string | null = null;
        let redirectUrl: string | null = null;
        let resolvedPlateId = cleanCode;

        // Backend server API call with cache-busting
        const serverPromise = fetch(`/api/nfc/${encodeURIComponent(cleanCode)}?_v=${Date.now()}`, {
          cache: 'no-store'
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        // Supabase lookup com .ilike() em qr_plates e nfc_plates
        const supabasePromise = (async () => {
          // A. Busca em qr_plates com relação tenants
          try {
            const { data: qrPlate, error: qrErr } = await supabase
              .from('qr_plates')
              .select('tenant_id, qr_code_id, status, redirect_url, tenants(slug, custom_domain)')
              .or(`qr_code_id.ilike.${cleanCode},id.ilike.${cleanCode},qr_code_id.ilike.${norm3},id.ilike.${norm3},qr_code_id.ilike.${qrc4},id.ilike.${qrc4}`)
              .maybeSingle();

            if (!qrErr && qrPlate) {
              const tenantsObj: any = qrPlate.tenants;
              const slug = extractSlugFromUrl(qrPlate.redirect_url) || tenantsObj?.slug || qrPlate.tenant_id;
              if (slug || qrPlate.redirect_url) {
                return { slug, plate: qrPlate };
              }
            }
          } catch (e) {}

          // B. Busca em nfc_plates com relação businesses
          try {
            const { data: nfcPlate, error: nfcErr } = await supabase
              .from('nfc_plates')
              .select('id, qr_code_id, status, redirect_url, merchant_id, merchant_slug, businesses(slug)')
              .or(`id.ilike.${cleanCode},qr_code_id.ilike.${cleanCode},id.ilike.${norm3},id.ilike.${stripped},id.ilike.${qrc3},id.ilike.${qrc4}`)
              .maybeSingle();

            if (!nfcErr && nfcPlate) {
              const bizObj: any = nfcPlate.businesses;
              const slug = extractSlugFromUrl(nfcPlate.redirect_url) || bizObj?.slug || nfcPlate.merchant_slug;
              if (slug || nfcPlate.redirect_url) {
                return { slug, plate: nfcPlate };
              }
            }
          } catch (e) {}

          return null;
        })();

        const [serverResult, supabaseResult] = await Promise.all([serverPromise, supabasePromise]);
        if (isCancelled || redirectedRef.current) return;

        if (supabaseResult && (supabaseResult.slug || supabaseResult.plate?.redirect_url)) {
          tenantSlug = supabaseResult.slug || extractSlugFromUrl(supabaseResult.plate?.redirect_url);
          redirectUrl = supabaseResult.plate?.redirect_url || null;
          resolvedPlateId = (supabaseResult.plate as any)?.id || (supabaseResult.plate as any)?.qr_code_id || cleanCode;
        } else if (serverResult && String(serverResult.status || '').toLowerCase() === 'active') {
          tenantSlug = extractSlugFromUrl(serverResult.redirect_url) || serverResult.merchant_slug;
          redirectUrl = serverResult.redirect_url || null;
          resolvedPlateId = serverResult.id || cleanCode;
        }

        // 3. Fallback síncrono APENAS se o servidor e o Supabase não retornarem registo
        if (!tenantSlug && !redirectUrl) {
          const fastPlate = findFastNfcPlate(cleanCode);
          const fastRedirect = fastPlate?.redirect_url;
          const fastStatus = String(fastPlate?.status || '').toLowerCase();
          if (fastPlate && fastStatus === 'active') {
            tenantSlug = extractSlugFromUrl(fastRedirect) || fastPlate.merchant_slug || null;
            redirectUrl = fastRedirect || null;
            resolvedPlateId = fastPlate.id;
          }
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
