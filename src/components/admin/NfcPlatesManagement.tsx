import React, { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Search,
  Copy,
  ExternalLink,
  CheckCircle2,
  Download,
  Check,
  Store,
  Smartphone
} from 'lucide-react';
import { Business } from '../../types';
import { getNfcRedirectUrl, getPublicReviewUrl } from '../../lib/urlHelper';
import { BusinessLogo } from '../common/BusinessLogo';

interface NfcPlatesManagementProps {
  businesses: Business[];
}

export const NfcPlatesManagement: React.FC<NfcPlatesManagementProps> = ({ businesses }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [selectedBizForQr, setSelectedBizForQr] = useState<Business | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const filteredBusinesses = useMemo(() => {
    return businesses.filter((b) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.category && b.category.toLowerCase().includes(q))
      );
    });
  }, [businesses, searchTerm]);

  const handleCopyUrl = (biz: Business) => {
    const url = getNfcRedirectUrl(biz.slug || biz.id);
    navigator.clipboard.writeText(url);
    setCopiedSlug(biz.slug);
    showToast(`Link do QR Code de "${biz.name}" copiado: ${url}`);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  const handleDownloadQrPng = (biz: Business) => {
    const slug = biz.slug || biz.id;
    const svg =
      document.getElementById(`modal-qr-svg-${slug}`) ||
      document.getElementById(`card-qr-svg-${slug}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 600;
      canvas.height = 700;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#4F46E5';
        ctx.fillRect(0, 0, canvas.width, 14);

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(biz.name, canvas.width / 2, 70);

        ctx.fillStyle = '#64748B';
        ctx.font = '16px sans-serif';
        ctx.fillText('Aponte a câmara e avalie a sua experiência', canvas.width / 2, 105);

        ctx.drawImage(img, 100, 130, 400, 400);

        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(getNfcRedirectUrl(slug), canvas.width / 2, 570);

        ctx.fillStyle = '#4F46E5';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('ReputaFlow • Avaliações & Reputação', canvas.width / 2, 630);
      }

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `QR_${slug}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      showToast(`QR Code de "${biz.name}" transferido em alta resolução (PNG)!`);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6 font-sans select-none">
      {toastMessage && (
        <div className="p-4 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-md bg-emerald-50 border border-emerald-200 text-emerald-800">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-500 hover:text-slate-800 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold">
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Code Automático por Comércio</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              QR Codes Exclusivos dos Estabelecimentos
            </h1>
            <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
              Cada comércio possui o seu QR Code único e direto gerado automaticamente no momento do cadastro com base no seu slug (<code className="text-indigo-300 font-mono">/qr/[slug]</code> → <code className="text-emerald-300 font-mono">/r/[slug]</code>).
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700 px-4 py-3 rounded-2xl">
            <Store className="w-5 h-5 text-indigo-400" />
            <div>
              <div className="text-lg font-black text-white leading-none">{businesses.length}</div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                QR Codes Ativos
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Pesquisar comércio por nome, slug ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Autonomous Merchant QR Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBusinesses.map((biz) => {
          const slug = biz.slug || biz.id;
          const qrUrl = getNfcRedirectUrl(slug);
          const directUrl = getPublicReviewUrl(slug);
          const isCopied = copiedSlug === biz.slug;

          return (
            <div
              key={biz.id}
              className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <BusinessLogo url={biz.logoUrl} name={biz.name} size="md" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-slate-900 truncate">{biz.name}</h3>
                    <span className="inline-block font-mono text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold mt-0.5">
                      /{slug}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Ativo
                </span>
              </div>

              <div className="flex items-center gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div
                  onClick={() => setSelectedBizForQr(biz)}
                  className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs shrink-0 cursor-pointer hover:border-indigo-400 transition"
                  title="Ampliar QR Code"
                >
                  <QRCodeSVG
                    id={`card-qr-svg-${slug}`}
                    value={qrUrl}
                    size={76}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Rota QR Direta
                    </div>
                    <div className="font-mono text-[11px] text-slate-700 truncate select-all" title={qrUrl}>
                      {qrUrl}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Destino Público
                    </div>
                    <div className="font-mono text-[11px] text-emerald-700 truncate select-all" title={directUrl}>
                      {directUrl}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => handleCopyUrl(biz)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    isCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                  }`}
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
                </button>

                <button
                  onClick={() => handleDownloadQrPng(biz)}
                  className="py-2 px-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar PNG</span>
                </button>

                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Testar</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Preview for Selected Business QR */}
      {selectedBizForQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4 relative animate-fade-in">
            <button
              onClick={() => setSelectedBizForQr(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 font-bold text-sm p-2 cursor-pointer"
            >
              ✕
            </button>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">
                <Smartphone className="w-3.5 h-3.5" />
                <span>QR Code Oficial</span>
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">{selectedBizForQr.name}</h3>
              <p className="text-xs text-slate-500 font-mono">
                {getNfcRedirectUrl(selectedBizForQr.slug || selectedBizForQr.id)}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block">
              <QRCodeSVG
                id={`modal-qr-svg-${selectedBizForQr.slug || selectedBizForQr.id}`}
                value={getNfcRedirectUrl(selectedBizForQr.slug || selectedBizForQr.id)}
                size={210}
                level="H"
                includeMargin={true}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadQrPng(selectedBizForQr)}
                className="flex-1 py-3 px-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Baixar PNG</span>
              </button>
              <button
                onClick={() => setSelectedBizForQr(null)}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
