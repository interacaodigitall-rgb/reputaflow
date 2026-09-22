import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Copy, ExternalLink, QrCode, Check } from 'lucide-react';
import { Business } from '../../types';
import { getPublicReviewUrl } from '../../lib/urlHelper';

interface QrCodeModalProps {
  business: Business | null;
  onClose: () => void;
  onOpenReviewPreview: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  business,
  onClose,
  onOpenReviewPreview
}) => {
  const [copied, setCopied] = useState(false);

  if (!business) return null;

  const publicReviewUrl = getPublicReviewUrl(business.slug || business.id);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicReviewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadPng = () => {
    const svg = document.getElementById('modal-qr-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 500;
      if (ctx) {
        // Background card
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header color bar
        ctx.fillStyle = '#4F46E5';
        ctx.fillRect(0, 0, canvas.width, 10);

        // Business Name
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(business.name, canvas.width / 2, 55);

        // Subtitle
        ctx.fillStyle = '#64748B';
        ctx.font = '14px sans-serif';
        ctx.fillText('Aponte a câmara e avalie a sua experiência', canvas.width / 2, 85);

        // Draw QR code centered
        ctx.drawImage(img, 75, 120, 250, 250);

        // Footer note
        ctx.fillStyle = '#94A3B8';
        ctx.font = '12px sans-serif';
        ctx.fillText('Avaliação rápida e segura • ReputaFlow', canvas.width / 2, 430);

        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `qrcode-${business.slug}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 text-center relative animate-fade-in my-auto max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1 pt-1 sm:pt-2">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{business.name}</h3>
          <p className="text-xs text-slate-500">
            Aponte a câmara do telemóvel para abrir a página de avaliação instantânea.
          </p>
        </div>

        {/* QR Code Container */}
        <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
          <QRCodeSVG
            id="modal-qr-svg"
            value={publicReviewUrl}
            size={190}
            level="H"
            includeMargin={true}
          />
        </div>

        {/* URL Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-between gap-2 text-left">
          <div className="font-mono text-[11px] text-slate-600 truncate flex-1 select-all px-1.5">
            {publicReviewUrl}
          </div>
          <button
            onClick={handleCopyLink}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 min-h-[38px] ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>

        <div className="space-y-2 pt-1">
          <button
            onClick={handleDownloadPng}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>Descarregar Placa em Imagem</span>
          </button>

          <a
            href={publicReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 min-h-[44px]"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Abrir Link em Nova Aba</span>
          </a>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={() => {
              onClose();
              onOpenReviewPreview();
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1.5 py-2 px-3 rounded-lg hover:bg-indigo-50/50 transition min-h-[40px]"
          >
            <span>Testar nesta janela</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
