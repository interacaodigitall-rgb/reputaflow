import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { extractNfcPlateId, extractSlugFromUrl } from '../../lib/urlHelper';
import { incrementNfcScan, findFastNfcPlate } from '../../lib/nfcService';
import { QrCode, ArrowRight, ShieldCheck, ExternalLink, HelpCircle } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

interface NfcRedirectPageProps {
  plateId?: string;
  onPlateResolved?: (slug: string) => void;
}

export const NfcRedirectPage: React.FC<NfcRedirectPageProps> = ({
  plateId: propPlateId,
  onPlateResolved
}) => {
  const [isResolving, setIsResolving] = useState(true);
  const [isUnassigned, setIsUnassigned] = useState(false);
  const [plateCode, setPlateCode] = useState<string>('');
  const redirectedRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const executeInstantRedirect = async () => {
      // 1. Extract plate ID from prop or URL
      const targetId = (propPlateId || extractNfcPlateId() || '').trim();
      setPlateCode(targetId);

      if (!targetId) {
        if (!isCancelled) {
          window.location.replace('/');
        }
        return;
      }

      // Fast synchronous check first
      const fastPlate = findFastNfcPlate(targetId);
      const fastRedirect = fastPlate?.redirect_url;
      const fastStatus = String(fastPlate?.status || '').toLowerCase();
      const fastSlug = fastPlate?.merchant_slug || extractSlugFromUrl(fastRedirect);

      if (fastPlate && fastStatus === 'active' && (fastRedirect || fastSlug)) {
        redirectedRef.current = true;
        incrementNfcScan(fastPlate.id, Number(fastPlate.scan_count || 0)).catch(() => {});

        if (fastSlug && onPlateResolved) {
          onPlateResolved(fastSlug);
          return;
        }

        let fullTarget = fastSlug
          ? `${window.location.origin}/r/${encodeURIComponent(fastSlug)}`
          : String(fastRedirect).trim();

        if (fullTarget.startsWith('/')) {
          fullTarget = window.location.origin + fullTarget;
        } else if (!/^https?:\/\//i.test(fullTarget)) {
          fullTarget = 'https://' + fullTarget;
        }

        window.location.replace(fullTarget);
        return;
      }

      // If not in synchronous fast cache, perform fast API & Supabase resolution
      try {
        let plateData: any = null;

        // Query 1: Backend Server API (PostgreSQL / Cloud SQL / local json)
        const serverPromise = fetch(`/api/nfc/${encodeURIComponent(targetId)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        // Query 2: Supabase (Cloud Database)
        const supabasePromise = (async () => {
          try {
            // Check nfc_plates
            const { data } = await supabase
              .from('nfc_plates')
              .select('*')
              .or(`id.eq.${targetId},qr_code_id.eq.${targetId}`)
              .maybeSingle();
            if (data) return data;

            // Check qr_plates fallback
            const qrRes = await supabase
              .from('qr_plates')
              .select('*')
              .or(`id.eq.${targetId},qr_code_id.eq.${targetId}`)
              .maybeSingle();
            return qrRes.data;
          } catch {
            return null;
          }
        })();

        const [serverResult, supabaseResult] = await Promise.all([serverPromise, supabasePromise]);
        if (isCancelled || redirectedRef.current) return;

        plateData = serverResult || supabaseResult;

        const redirectUrl = plateData?.redirect_url || plateData?.redirectUrl;
        const status = String(plateData?.status || '').toLowerCase();
        const tenantSlug = plateData?.merchant_slug || plateData?.merchantSlug || extractSlugFromUrl(redirectUrl);

        if (plateData && status === 'active' && (redirectUrl || tenantSlug)) {
          redirectedRef.current = true;

          // Asynchronously fire scan counter increment
          incrementNfcScan(plateData.id, Number(plateData.scan_count || plateData.scanCount || 0)).catch(() => {});

          if (tenantSlug && onPlateResolved) {
            onPlateResolved(tenantSlug);
            return;
          }

          let fullTarget = tenantSlug
            ? `${window.location.origin}/r/${encodeURIComponent(tenantSlug)}`
            : String(redirectUrl).trim();

          if (fullTarget.startsWith('/')) {
            fullTarget = window.location.origin + fullTarget;
          } else if (!/^https?:\/\//i.test(fullTarget)) {
            fullTarget = 'https://' + fullTarget;
          }

          window.location.replace(fullTarget);
          return;
        }

        // Plate is empty / unassigned / not found (Passo 2)
        if (!isCancelled) {
          setIsResolving(false);
          setIsUnassigned(true);
        }
      } catch (err) {
        console.warn('[Instant QR Resolution notice]:', err);
        if (!isCancelled) {
          setIsResolving(false);
          setIsUnassigned(true);
        }
      }
    };

    executeInstantRedirect();

    return () => {
      isCancelled = true;
    };
  }, [propPlateId, onPlateResolved]);

  // Passo 1: Zero intermediate loading screen. Render nothing while instant redirection takes place.
  if (isResolving) {
    return null;
  }

  // Passo 2: Validação de Placa Vazia (não vinculada ou inativa)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none font-sans">
      <div className="max-w-sm w-full bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-xl space-y-5 animate-fade-in">
        <div className="flex justify-center">
          <BrandLogo size="md" />
        </div>

        <div className="w-14 h-14 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <QrCode className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Placa #{plateCode || 'NFC'}</span>
          </div>

          <h2 className="text-base font-extrabold text-slate-900 leading-snug">
            Placa Disponível para Atribuição
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Esta placa de avaliação ainda não está vinculada a nenhum estabelecimento comercial. Entre no painel de administração para ativá-la.
          </p>
        </div>

        <div className="pt-2 space-y-2">
          <a
            href="/"
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm min-h-[44px]"
          >
            <span>Ir para a Página Inicial</span>
            <ArrowRight className="w-4 h-4" />
          </a>

          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = '/';
            }}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 min-h-[40px]"
          >
            <span>Aceder ao Painel</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>ReputaFlow • Gestão Inteligente de Avaliações</span>
        </div>
      </div>
    </div>
  );
};
