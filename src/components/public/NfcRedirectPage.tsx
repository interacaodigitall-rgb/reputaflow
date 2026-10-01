import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { extractNfcPlateId } from '../../lib/urlHelper';
import { incrementNfcScan } from '../../lib/nfcService';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

interface NfcRedirectPageProps {
  plateId?: string;
}

export const NfcRedirectPage: React.FC<NfcRedirectPageProps> = ({ plateId: propPlateId }) => {
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const handleRedirect = async () => {
      // 1. Extract plate ID
      const targetId = (propPlateId || extractNfcPlateId() || '').trim();

      if (!targetId) {
        if (!isCancelled) {
          window.location.replace('/');
        }
        return;
      }

      try {
        let plateData: any = null;

        // Query 1: Backend Server API (PostgreSQL)
        const serverPromise = fetch(`/api/nfc/${encodeURIComponent(targetId)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        // Query 2: Supabase (Cloud Database)
        const supabasePromise = (async () => {
          try {
            const { data } = await supabase
              .from('nfc_plates')
              .select('*')
              .eq('id', targetId)
              .maybeSingle();
            return data;
          } catch {
            return null;
          }
        })();

        const [serverResult, supabaseResult] = await Promise.all([serverPromise, supabasePromise]);
        if (isCancelled || redirectedRef.current) return;

        plateData = serverResult || supabaseResult;

        // Query 3: Local Storage Fallback
        if (!plateData) {
          try {
            const raw = localStorage.getItem('reputaflow_nfc_plates_cache');
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                plateData = list.find((p: any) => String(p.id).trim() === targetId);
              }
            }
          } catch {}
        }

        // 3. Evaluate Plate Status & Target Redirect URL
        const redirectUrl = plateData?.redirect_url || plateData?.redirectUrl;
        const status = String(plateData?.status || '').toLowerCase();

        if (plateData && status === 'active' && redirectUrl) {
          redirectedRef.current = true;

          // Asynchronously fire scan counter increment
          incrementNfcScan(plateData.id, Number(plateData.scan_count || plateData.scanCount || 0)).catch(() => {});

          // Build full absolute target URL
          let fullTarget = String(redirectUrl).trim();
          if (fullTarget.startsWith('/')) {
            fullTarget = window.location.origin + fullTarget;
          } else if (!/^https?:\/\//i.test(fullTarget)) {
            fullTarget = 'https://' + fullTarget;
          }

          setTargetUrl(fullTarget);

          // ----------------------------------------------------
          // ANDROID / WEBVIEW BULLETPROOF REDIRECTION STRATEGY
          // ----------------------------------------------------

          // 1. Injeta HTML <meta http-equiv="refresh"> no <head> (Bypass restrições JS em WebViews Android)
          if (typeof document !== 'undefined') {
            try {
              let metaRefresh = document.querySelector('meta[http-equiv="refresh"]') as HTMLMetaElement;
              if (!metaRefresh) {
                metaRefresh = document.createElement('meta');
                metaRefresh.httpEquiv = 'refresh';
                document.head.appendChild(metaRefresh);
              }
              metaRefresh.content = `0; url=${fullTarget}`;
            } catch (e) {
              console.warn('Meta refresh injection notice:', e);
            }
          }

          // 2. Dispara clique simulado em link nativo
          try {
            const link = document.createElement('a');
            link.href = fullTarget;
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } catch {}

          // 3. Fallback padrão JavaScript
          try {
            window.location.replace(fullTarget);
          } catch {
            window.location.href = fullTarget;
          }

          return;
        }

        // 4. Inactive or Not Found State
        setLoading(false);
        setStatusMessage(
          plateData
            ? 'Esta placa ainda não está ativada. Fale com a gerência.'
            : 'Esta placa NFC não foi encontrada no sistema.'
        );

        setTimeout(() => {
          if (!isCancelled) {
            window.location.replace('/');
          }
        }, 4000);
      } catch (err) {
        console.error('NFC redirect processing error:', err);
        if (!isCancelled) {
          setLoading(false);
          setStatusMessage('Esta placa ainda não está ativada. Fale com a gerência.');
          setTimeout(() => {
            window.location.replace('/');
          }, 4000);
        }
      }
    };

    handleRedirect();

    return () => {
      isCancelled = true;
    };
  }, [propPlateId]);

  // Countdown effect when target is found (for manual fallback button)
  useEffect(() => {
    if (!targetUrl) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetUrl]);

  // Redirection in Progress / Loading State (Visual Feedback & Android Fallback CTA)
  if (loading || targetUrl) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-sm w-full bg-white border border-slate-200 p-8 rounded-3xl shadow-xl space-y-6">
          <div className="flex justify-center">
            <BrandLogo size="md" />
          </div>

          <div className="py-2 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">
                A redirecionar...
              </h2>
              <p className="text-xs text-slate-500">
                A carregar a página de avaliação da experiência
              </p>
            </div>
          </div>

          {/* Android Fallback Direct Button if WebView delays JS execution */}
          {targetUrl && (
            <div className="pt-2 space-y-2">
              <a
                href={targetUrl}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-indigo-900/20"
              >
                <span>Abrir Avaliação Agora</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <p className="text-[11px] text-slate-400">
                Se não for redirecionado em {countdown}s, clique no botão acima.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>ReputaFlow • Redirecionamento Automático</span>
          </div>
        </div>
      </div>
    );
  }

  // Inactive / Error State
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
      <div className="max-w-sm w-full bg-white border border-slate-200 p-8 rounded-3xl shadow-xl space-y-6">
        <div className="flex justify-center">
          <BrandLogo size="md" />
        </div>

        <div className="w-14 h-14 bg-amber-50 text-amber-600 border border-amber-200/80 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-extrabold text-slate-900">
            Placa não disponível
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            {statusMessage || 'Esta placa ainda não está ativada. Fale com a gerência.'}
          </p>
        </div>

        <div className="pt-2 space-y-2">
          <a
            href="/"
            className="w-full py-3 px-4 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
          >
            <span>Ir para a Página Inicial</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <p className="text-[10px] text-slate-400">
            A redirecionar automaticamente em 4 segundos...
          </p>
        </div>
      </div>
    </div>
  );
};
