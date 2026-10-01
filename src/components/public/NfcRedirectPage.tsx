import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { extractNfcPlateId } from '../../lib/urlHelper';
import { incrementNfcScan } from '../../lib/nfcService';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

interface NfcRedirectPageProps {
  plateId?: string;
}

export const NfcRedirectPage: React.FC<NfcRedirectPageProps> = ({ plateId: propPlateId }) => {
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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
        // 2. Fetch from Supabase directly
        const { data, error } = await supabase
          .from('nfc_plates')
          .select('*')
          .eq('id', targetId)
          .maybeSingle();

        if (isCancelled || redirectedRef.current) return;

        let plateData = data;

        // Fallback to local cache if offline / temporary network issue
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

        // 3. Evaluate Plate Status & Redirect URL
        if (plateData && plateData.status === 'active' && plateData.redirect_url) {
          redirectedRef.current = true;

          // Asynchronously fire scan counter increment
          incrementNfcScan(plateData.id, Number(plateData.scan_count || 0)).catch(() => {});

          // Build full absolute target URL
          let target = String(plateData.redirect_url).trim();
          if (target.startsWith('/')) {
            target = window.location.origin + target;
          } else if (!/^https?:\/\//i.test(target)) {
            target = 'https://' + target;
          }

          // Force immediate browser redirect
          try {
            window.location.replace(target);
          } catch {
            window.location.href = target;
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

        // Auto redirect to home after 4 seconds
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

  // Loading State (Visual Feedback with Spinner)
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-sm w-full bg-white border border-slate-200 p-8 rounded-3xl shadow-xl space-y-5">
          <div className="flex justify-center">
            <BrandLogo size="md" />
          </div>

          <div className="py-4 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-9 h-9 text-indigo-600 animate-spin" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900">
                A carregar página de avaliação...
              </h2>
              <p className="text-xs text-slate-400">
                A validar placa e a redirecionar
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1 text-[11px] text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>ReputaFlow • Redirecionamento Seguro</span>
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
