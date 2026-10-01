import React, { useEffect, useState } from 'react';
import { getNfcPlateById, incrementNfcScan } from '../../lib/nfcService';
import { NfcPlate } from '../../types/nfc';
import { Radio, Loader2, ArrowRight, AlertCircle, Store } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

interface NfcRedirectPageProps {
  plateId: string;
}

export const NfcRedirectPage: React.FC<NfcRedirectPageProps> = ({ plateId }) => {
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<'not_found' | 'inactive' | null>(null);
  const [plate, setPlate] = useState<NfcPlate | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const performRedirect = async () => {
      const cleanId = (plateId || '').trim();
      if (!cleanId) {
        window.location.replace('/');
        return;
      }

      try {
        const found = await getNfcPlateById(cleanId);
        if (isCancelled) return;

        if (!found) {
          setErrorStatus('not_found');
          setLoading(false);
          // Auto fallback to home after 3s
          setTimeout(() => {
            if (!isCancelled) {
              window.location.replace('/');
            }
          }, 3500);
          return;
        }

        setPlate(found);

        if (found.status === 'active' && found.redirect_url) {
          // Increment scan counter
          try {
            await incrementNfcScan(found.id, found.scan_count);
          } catch (err) {
            console.warn('Scan increment notice:', err);
          }

          let targetUrl = found.redirect_url.trim();
          if (!/^https?:\/\//i.test(targetUrl) && !targetUrl.startsWith('/')) {
            targetUrl = 'https://' + targetUrl;
          }

          // Instant 302-equivalent replace
          window.location.replace(targetUrl);
        } else {
          setErrorStatus('inactive');
          setLoading(false);
          setTimeout(() => {
            if (!isCancelled) {
              window.location.replace('/');
            }
          }, 3500);
        }
      } catch (err) {
        console.error('Error during NFC redirect:', err);
        if (!isCancelled) {
          window.location.replace('/');
        }
      }
    };

    performRedirect();

    return () => {
      isCancelled = true;
    };
  }, [plateId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-sm w-full bg-slate-900/90 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6 animate-pulse">
          <div className="w-16 h-16 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Radio className="w-8 h-8 animate-bounce" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-bold text-white tracking-tight">
              A conectar à Placa NFC #{plateId}
            </h1>
            <p className="text-xs text-slate-400">
              A validar leitura e a redirecionar para a página de avaliação...
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-indigo-400 text-xs font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>A carregar estabelecimento...</span>
          </div>
        </div>
      </div>
    );
  }

  if (errorStatus === 'inactive' || errorStatus === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="flex justify-center">
            <BrandLogo size="md" variant="dark" />
          </div>

          <div className="w-14 h-14 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-bold text-white">
              {errorStatus === 'inactive' ? 'Placa NFC Inativa' : 'Placa NFC Não Encontrada'}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {errorStatus === 'inactive'
                ? `A placa serial #${plateId} ainda não foi vinculada a um lojista ativo no painel.`
                : `O código de placa #${plateId} não está registado no sistema.`}
            </p>
          </div>

          <div className="pt-2">
            <a
              href="/"
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30"
            >
              <span>Ir para a Página Inicial</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <p className="text-[10px] text-slate-500 mt-3">
              Redirecionamento automático em 3 segundos...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
