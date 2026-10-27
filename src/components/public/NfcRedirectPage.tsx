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
      // 1. Extrai e normaliza o código em maiúsculas (ex: QRC0002)
      const rawCode = (propPlateId || extractNfcPlateId() || '').trim();
      const cleanCode = rawCode.toUpperCase();
      const stripped = cleanCode.replace(/^(?:QRC|NFC)-?/i, '');
      const numOnly = stripped.replace(/^0+/, '') || '0';
      const norm3 = numOnly.padStart(3, '0');

      if (!cleanCode) {
        if (!isCancelled) {
          window.location.replace('/?error=qr_nao_atribuido');
        }
        return;
      }

      // 2. Consulta síncrona imediata (Fast Cache / Baseline)
      const fastPlate = findFastNfcPlate(cleanCode);
      const fastRedirect = fastPlate?.redirect_url;
      const fastStatus = String(fastPlate?.status || '').toLowerCase();
      const fastSlug = fastPlate?.merchant_slug || extractSlugFromUrl(fastRedirect);

      if (fastPlate && fastStatus === 'active' && (fastRedirect || fastSlug)) {
        redirectedRef.current = true;
        incrementNfcScan(fastPlate.id, Number(fastPlate.scan_count || 0)).catch(() => {});

        if (fastSlug) {
          if (onPlateResolved) {
            onPlateResolved(fastSlug);
            return;
          }
          window.location.replace(`/r/${encodeURIComponent(fastSlug)}`);
          return;
        }

        let fullTarget = String(fastRedirect).trim();
        if (fullTarget.startsWith('/')) {
          fullTarget = window.location.origin + fullTarget;
        } else if (!/^https?:\/\//i.test(fullTarget)) {
          fullTarget = 'https://' + fullTarget;
        }
        window.location.replace(fullTarget);
        return;
      }

      // 3. Consulta assíncrona robusta com .ilike() no Supabase & API local
      try {
        let tenantSlug: string | null = null;
        let redirectUrl: string | null = null;
        let resolvedPlateId = cleanCode;

        // Backend server API call
        const serverPromise = fetch(`/api/nfc/${encodeURIComponent(cleanCode)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        // Supabase lookup com .ilike() em qr_plates e nfc_plates
        const supabasePromise = (async () => {
          // A. Busca em qr_plates com relação tenants
          try {
            const { data: qrPlate, error: qrErr } = await supabase
              .from('qr_plates')
              .select('tenant_id, qr_code_id, status, redirect_url, tenants(slug, custom_domain)')
              .or(`qr_code_id.ilike.${cleanCode},id.ilike.${cleanCode},qr_code_id.ilike.${norm3},id.ilike.${norm3}`)
              .maybeSingle();

            if (!qrErr && qrPlate) {
              const tenantsObj: any = qrPlate.tenants;
              const slug = tenantsObj?.slug || extractSlugFromUrl(qrPlate.redirect_url) || qrPlate.tenant_id;
              if (slug) {
                return { slug, plate: qrPlate };
              }
            }
          } catch (e) {}

          // B. Busca em nfc_plates com relação businesses
          try {
            const { data: nfcPlate, error: nfcErr } = await supabase
              .from('nfc_plates')
              .select('id, qr_code_id, status, redirect_url, merchant_id, merchant_slug, businesses(slug)')
              .or(`id.ilike.${cleanCode},qr_code_id.ilike.${cleanCode},id.ilike.${norm3},id.ilike.${stripped}`)
              .maybeSingle();

            if (!nfcErr && nfcPlate) {
              const bizObj: any = nfcPlate.businesses;
              const slug = nfcPlate.merchant_slug || bizObj?.slug || extractSlugFromUrl(nfcPlate.redirect_url);
              if (slug || nfcPlate.redirect_url) {
                return { slug, plate: nfcPlate };
              }
            }
          } catch (e) {}

          return null;
        })();

        const [serverResult, supabaseResult] = await Promise.all([serverPromise, supabasePromise]);
        if (isCancelled || redirectedRef.current) return;

        if (supabaseResult && supabaseResult.slug) {
          tenantSlug = supabaseResult.slug;
          redirectUrl = supabaseResult.plate?.redirect_url || null;
          resolvedPlateId = (supabaseResult.plate as any)?.id || (supabaseResult.plate as any)?.qr_code_id || cleanCode;
        } else if (serverResult) {
          tenantSlug = serverResult.merchant_slug || extractSlugFromUrl(serverResult.redirect_url);
          redirectUrl = serverResult.redirect_url || null;
          resolvedPlateId = serverResult.id || cleanCode;
        }

        // Se encontrou tenant válido, redireciona 100% instantâneo para a página de avaliação
        if (tenantSlug || redirectUrl) {
          redirectedRef.current = true;
          incrementNfcScan(resolvedPlateId).catch(() => {});

          if (tenantSlug) {
            if (onPlateResolved) {
              onPlateResolved(tenantSlug);
              return;
            }
            window.location.replace(`/r/${encodeURIComponent(tenantSlug)}`);
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

        // Se não encontrar ou não estiver atribuído, redireciona para página de erro limpa
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

  // Passo 2: Blindagem Client-Side. Retorna null imediatamente para que NENHUM HTML de loading seja pintado na tela
  return null;
};
