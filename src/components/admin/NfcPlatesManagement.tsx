import React, { useState, useEffect, useMemo } from 'react';
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
  Smartphone,
  Plus,
  Link2,
  Layers,
  ShieldCheck,
  RefreshCw,
  X,
  AlertCircle
} from 'lucide-react';
import { Business } from '../../types';
import {
  NfcPlate,
  subscribeNfcPlates,
  createNfcPlatesBatch,
  linkNfcPlate,
  extractPlateNumber
} from '../../lib/nfcService';
import { getNfcRedirectUrl, getPublicReviewUrl } from '../../lib/urlHelper';
import { BusinessLogo } from '../common/BusinessLogo';

interface NfcPlatesManagementProps {
  businesses: Business[];
}

export const NfcPlatesManagement: React.FC<NfcPlatesManagementProps> = ({ businesses }) => {
  const [plates, setPlates] = useState<NfcPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Batch Generation Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [generatingBatch, setGeneratingBatch] = useState(false);

  // Manual Link Modal State
  const [plateToLink, setPlateToLink] = useState<NfcPlate | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantSearch, setTenantSearch] = useState<string>('');
  const [linking, setLinking] = useState(false);

  // QR Preview Modal State
  const [previewPlate, setPreviewPlate] = useState<NfcPlate | null>(null);

  const showToastMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeNfcPlates(businesses, (loadedPlates) => {
      setPlates(loadedPlates);
      setLoading(false);
    });
    return () => unsub();
  }, [businesses]);

  // Compute the highest existing plate number so next batch always starts at highest + 1 (e.g. #005 -> #006)
  const highestExistingNumber = useMemo(() => {
    let maxNum = 5;
    for (const p of plates) {
      const n = extractPlateNumber(p.id);
      if (n > maxNum) maxNum = n;
    }
    return maxNum;
  }, [plates]);

  const nextSafeStartNumber = highestExistingNumber + 1;

  const stats = useMemo(() => {
    const total = plates.length;
    const active = plates.filter(
      (p) => p.status === 'active' && Boolean(p.merchant_id || p.merchant_slug || p.redirect_url)
    ).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [plates]);

  const filteredPlates = useMemo(() => {
    return plates.filter((p) => {
      const isPlateActive =
        p.status === 'active' && Boolean(p.merchant_id || p.merchant_slug || p.redirect_url);

      if (statusFilter === 'active' && !isPlateActive) return false;
      if (statusFilter === 'inactive' && isPlateActive) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const numStr = String(extractPlateNumber(p.id)).padStart(3, '0');
      const qrcStr = `qrc${String(extractPlateNumber(p.id)).padStart(4, '0')}`;

      return (
        p.id.toLowerCase().includes(q) ||
        `#${numStr}`.includes(q) ||
        qrcStr.includes(q) ||
        (p.merchant_name && p.merchant_name.toLowerCase().includes(q)) ||
        (p.merchant_slug && p.merchant_slug.toLowerCase().includes(q))
      );
    });
  }, [plates, statusFilter, searchTerm]);

  const filteredModalTenants = useMemo(() => {
    if (!tenantSearch.trim()) return businesses;
    const q = tenantSearch.toLowerCase();
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.category && b.category.toLowerCase().includes(q))
    );
  }, [businesses, tenantSearch]);

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (batchQuantity < 1 || batchQuantity > 500) {
      showToastMessage('Escolha uma quantidade válida entre 1 e 500 placas.', 'error');
      return;
    }

    setGeneratingBatch(true);
    try {
      const res = await createNfcPlatesBatch({
        quantity: batchQuantity,
        startNumber: nextSafeStartNumber,
        padDigits: 3
      });

      if (res.success) {
        setShowBatchModal(false);
        showToastMessage(
          `Lote de ${res.createdCount} placas gerado com sucesso (#${res.startSerial} até #${res.endSerial})! Placas atribuídas preservadas.`,
          'success'
        );
      } else {
        showToastMessage(res.error || 'Erro ao gerar lote de placas.', 'error');
      }
    } catch (err: any) {
      showToastMessage(err?.message || 'Erro ao gerar lote de placas.', 'error');
    } finally {
      setGeneratingBatch(false);
    }
  };

  const openLinkModal = (plate: NfcPlate) => {
    setPlateToLink(plate);
    setTenantSearch('');
    const currentBiz = businesses.find(
      (b) => b.id === plate.merchant_id || b.slug === plate.merchant_slug
    );
    setSelectedTenantId(currentBiz?.id || businesses[0]?.id || '');
  };

  const handleConfirmLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateToLink || !selectedTenantId) {
      showToastMessage('Selecione um estabelecimento para vincular a placa.', 'error');
      return;
    }

    const targetBiz = businesses.find((b) => b.id === selectedTenantId);
    if (!targetBiz) {
      showToastMessage('Estabelecimento selecionado não encontrado.', 'error');
      return;
    }

    setLinking(true);
    try {
      const res = await linkNfcPlate(
        plateToLink.id,
        targetBiz.id,
        `/r/${encodeURIComponent(targetBiz.slug)}`
      );
      if (res.success) {
        showToastMessage(
          `Placa #${plateToLink.id} vinculada com sucesso ao comércio "${targetBiz.name}"!`,
          'success'
        );
        setPlateToLink(null);
      } else {
        showToastMessage(res.error || 'Erro ao vincular placa.', 'error');
      }
    } catch (err: any) {
      showToastMessage(err?.message || 'Erro ao vincular placa.', 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleCopyPlateUrl = (plate: NfcPlate) => {
    const url = getNfcRedirectUrl(plate.id);
    navigator.clipboard.writeText(url);
    setCopiedId(plate.id);
    showToastMessage(`Link da placa #${plate.id} copiado: ${url}`, 'success');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleDownloadPlateQr = (plate: NfcPlate) => {
    const svg =
      document.getElementById(`modal-plate-qr-${plate.id}`) ||
      document.getElementById(`card-plate-qr-${plate.id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 600;
      canvas.height = 720;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Google 4-color header bar on PNG
        const quarter = canvas.width / 4;
        ctx.fillStyle = '#4285F4';
        ctx.fillRect(0, 0, quarter, 14);
        ctx.fillStyle = '#EA4335';
        ctx.fillRect(quarter, 0, quarter, 14);
        ctx.fillStyle = '#FBBC05';
        ctx.fillRect(quarter * 2, 0, quarter, 14);
        ctx.fillStyle = '#34A853';
        ctx.fillRect(quarter * 3, 0, quarter, 14);

        ctx.fillStyle = '#202124';
        ctx.font = 'bold 28px Inter, Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          plate.merchant_name || `Placa QR #${plate.id}`,
          canvas.width / 2,
          70
        );

        ctx.fillStyle = '#5F6368';
        ctx.font = '16px Inter, Roboto, sans-serif';
        ctx.fillText('Aponte a câmara para avaliar a sua experiência', canvas.width / 2, 104);

        ctx.drawImage(img, 100, 130, 400, 400);

        ctx.fillStyle = '#4285F4';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`PLACA #${plate.id}`, canvas.width / 2, 568);

        ctx.fillStyle = '#5F6368';
        ctx.font = '13px monospace';
        ctx.fillText(getNfcRedirectUrl(plate.id), canvas.width / 2, 598);

        ctx.fillStyle = '#202124';
        ctx.font = 'bold 14px Inter, Roboto, sans-serif';
        ctx.fillText('GlowfyHub • Gestão de Reputação & Avaliações', canvas.width / 2, 650);
      }

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `Placa_QR_${plate.id}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      showToastMessage(`QR Code da Placa #${plate.id} transferido em alta resolução!`, 'success');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6 font-sans select-none">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-sm border ${
            toast.type === 'success'
              ? 'bg-[#34A853]/10 border-[#34A853]/30 text-[#137333]'
              : 'bg-[#EA4335]/10 border-[#EA4335]/30 text-[#C5221F]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-[#34A853] shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[#EA4335] shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-gray-500 hover:text-gray-800 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Card - Google Design System */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="h-1.5 w-full google-color-bar" />
        <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#4285F4]/10 text-[#1A73E8] border border-[#4285F4]/20 rounded-full text-xs font-semibold">
              <QrCode className="w-3.5 h-3.5" />
              <span>Gestão de Placas NFC / QR Dinâmico</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
              Stock de Placas &amp; Redirecionamento Dinâmico
            </h2>
            <p className="text-gray-500 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Gere novos lotes de placas físicas numeradas sem sobrepor os QR Codes já atribuídos. Cada placa ativa redireciona instantaneamente em tempo real (<code className="text-[#1A73E8] font-mono bg-[#4285F4]/10 px-1.5 py-0.5 rounded">/qr/[code]</code> → <code className="text-[#137333] font-mono bg-[#34A853]/10 px-1.5 py-0.5 rounded">/r/[slug]</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowBatchModal(true)}
              className="py-2.5 px-5 bg-[#4285F4] hover:bg-[#3367D6] active:bg-[#2A56C6] text-white font-semibold rounded-lg text-xs sm:text-sm shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Gerar Lote de Placas</span>
            </button>
          </div>
        </div>

        {/* Summary Counters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 border-t border-gray-200 bg-gray-50/60">
          <div className="px-6 py-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Total de Placas
              </span>
              <span className="text-xl font-bold text-gray-900 tabular-nums">{stats.total}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#4285F4]/10 text-[#4285F4] flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
          </div>

          <div className="px-6 py-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Ativas / Vinculadas (Protegidas)
              </span>
              <span className="text-xl font-bold text-[#34A853] tabular-nums">{stats.active}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#34A853]/10 text-[#34A853] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="px-6 py-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Disponíveis em Stock (Inativas)
              </span>
              <span className="text-xl font-bold text-[#FBBC05] tabular-nums">{stats.inactive}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#FBBC05]/15 text-[#D97706] flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar por número da placa (#001, QRC0004) ou nome do comércio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Todas ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-[#34A853] text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Ativas ({stats.active})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'inactive'
                ? 'bg-[#4285F4] text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Inativas / Stock ({stats.inactive})
          </button>
        </div>
      </div>

      {/* Plates Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-[#4285F4] animate-spin mx-auto" />
          <p className="text-xs font-semibold text-gray-500">A carregar stock de placas QR...</p>
        </div>
      ) : filteredPlates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3">
          <QrCode className="w-8 h-8 text-gray-400 mx-auto" />
          <h3 className="text-sm font-bold text-gray-900">Nenhuma placa encontrada</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Ajuste os filtros de pesquisa ou clique em "Gerar Lote de Placas" para adicionar novas placas ao stock.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlates.map((plate) => {
            const num = extractPlateNumber(plate.id);
            const displaySerial = num > 0 ? `#${String(num).padStart(3, '0')}` : `#${plate.id}`;
            const qrcAlias = num > 0 ? `QRC${String(num).padStart(4, '0')}` : plate.id;
            const isAssigned =
              plate.status === 'active' &&
              Boolean(plate.merchant_id || plate.merchant_slug || plate.redirect_url);

            const linkedBiz = businesses.find(
              (b) =>
                (plate.merchant_id && b.id === plate.merchant_id) ||
                (plate.merchant_slug && b.slug.toLowerCase() === plate.merchant_slug.toLowerCase())
            );
            const merchantName = linkedBiz?.name || plate.merchant_name;
            const merchantSlug = linkedBiz?.slug || plate.merchant_slug;
            const qrUrl = getNfcRedirectUrl(plate.id);
            const targetUrl = merchantSlug ? getPublicReviewUrl(merchantSlug) : null;
            const isCopied = copiedId === plate.id;

            return (
              <div
                key={plate.id}
                className={`bg-white rounded-2xl border p-5 shadow-2xs hover:shadow-md transition flex flex-col justify-between gap-4 ${
                  isAssigned ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50/30'
                }`}
              >
                {/* Card Top Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {isAssigned ? (
                      <BusinessLogo
                        url={linkedBiz?.logoUrl || plate.merchant_logo_url}
                        name={merchantName || displaySerial}
                        size="md"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 font-mono font-bold text-xs shrink-0">
                        {displaySerial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-[#1A73E8] bg-[#4285F4]/10 px-2 py-0.5 rounded-md">
                          {displaySerial}
                        </span>
                        <span className="font-mono text-[10px] text-gray-400">{qrcAlias}</span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 truncate mt-1">
                        {isAssigned ? merchantName || merchantSlug : 'Placa Disponível em Stock'}
                      </h3>
                    </div>
                  </div>

                  {isAssigned ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#34A853]/10 text-[#137333] border border-[#34A853]/25 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
                      Ativa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FBBC05]/15 text-[#B06000] border border-[#FBBC05]/30 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                      Inativa
                    </span>
                  )}
                </div>

                {/* QR & Route Details */}
                <div className="flex items-center gap-3.5 bg-gray-50 p-3 rounded-xl border border-gray-200/70">
                  <div
                    onClick={() => setPreviewPlate(plate)}
                    className="bg-white p-2 rounded-lg border border-gray-200 shadow-2xs shrink-0 cursor-pointer hover:border-[#4285F4] transition"
                    title="Ampliar QR Code"
                  >
                    <QRCodeSVG
                      id={`card-plate-qr-${plate.id}`}
                      value={qrUrl}
                      size={70}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Link da Placa QR
                      </div>
                      <div
                        className="font-mono text-[11px] text-gray-700 truncate select-all"
                        title={qrUrl}
                      >
                        {qrUrl}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Comércio Vinculado
                      </div>
                      {isAssigned && merchantSlug ? (
                        <div
                          className="font-mono text-[11px] text-[#137333] font-semibold truncate select-all"
                          title={targetUrl || ''}
                        >
                          /r/{merchantSlug}
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-400 italic">
                          Aguardando vinculação...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  {!isAssigned ? (
                    <button
                      type="button"
                      onClick={() => openLinkModal(plate)}
                      className="flex-1 py-2 px-3 bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Vincular a Comércio</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openLinkModal(plate)}
                      className="py-2 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Alterar comércio vinculado"
                    >
                      <Link2 className="w-3.5 h-3.5 text-[#4285F4]" />
                      <span>Vincular</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopyPlateUrl(plate)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer ${
                      isCopied
                        ? 'bg-[#34A853] text-white'
                        : 'bg-[#4285F4]/10 hover:bg-[#4285F4]/15 text-[#1A73E8]'
                    }`}
                    title="Copiar Link da Placa"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadPlateQr(plate)}
                    className="py-2 px-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                    title="Baixar PNG"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PNG</span>
                  </button>

                  {isAssigned && (
                    <a
                      href={qrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition flex items-center justify-center"
                      title="Testar Redirecionamento"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: GERAR LOTE DE PLACAS (COM PROTEÇÃO DE ATRIBUÍDOS) */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-xl overflow-hidden animate-fade-in">
            <div className="h-1.5 w-full google-color-bar" />
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#4285F4]/10 text-[#1A73E8] rounded-full text-[11px] font-semibold">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Gerador Seguro de Stock</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Gerar Lote de Placas QR</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Safe Start Notice */}
              <div className="p-3.5 bg-[#34A853]/10 border border-[#34A853]/25 rounded-xl flex items-start gap-2.5 text-xs text-[#137333]">
                <ShieldCheck className="w-4 h-4 text-[#34A853] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Proteção de Placas Atribuídas Ativa</span>
                  <span>
                    Última placa registada: <strong>#{String(highestExistingNumber).padStart(3, '0')}</strong>. O novo lote iniciará automaticamente em{' '}
                    <strong>#{String(nextSafeStartNumber).padStart(3, '0')}</strong> até{' '}
                    <strong>
                      #{String(nextSafeStartNumber + Math.max(1, batchQuantity) - 1).padStart(3, '0')}
                    </strong>
                    , mantendo intactos todos os comércios já vinculados.
                  </span>
                </div>
              </div>

              <form onSubmit={handleGenerateBatch} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Escolha a quantidade de placas a gerar:
                  </label>
                  <div className="grid grid-cols-3 gap-2.5 mb-3">
                    {[10, 20, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBatchQuantity(preset)}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          batchQuantity === preset
                            ? 'bg-[#4285F4] text-white border-[#4285F4] shadow-xs'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        +{preset} Placas
                      </button>
                    ))}
                  </div>

                  <label className="block text-[11px] font-medium text-gray-500 mb-1">
                    Ou introduza uma quantidade personalizada:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={batchQuantity}
                    onChange={(e) => setBatchQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="py-2.5 px-4 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={generatingBatch}
                    className="py-2.5 px-5 bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {generatingBatch ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>
                      {generatingBatch
                        ? 'A gerar lote...'
                        : `Gerar ${batchQuantity} Placas (#${String(nextSafeStartNumber).padStart(3, '0')}–#${String(
                            nextSafeStartNumber + batchQuantity - 1
                          ).padStart(3, '0')})`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VINCULAR PLACA A ESTABELECIMENTO (GOOGLE DESIGN SYSTEM) */}
      {plateToLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-xl overflow-hidden animate-fade-in">
            <div className="h-1.5 w-full google-color-bar" />
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#4285F4]/10 text-[#1A73E8] rounded-full text-[11px] font-semibold">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Vinculação de Placa QR</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Vincular Placa #{plateToLink.id}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Escolha o estabelecimento comercial que será aberto imediatamente quando esta placa for lida.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPlateToLink(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Pesquisar Comércio
                  </label>
                  <div className="relative mb-2.5">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Filtrar estabelecimento por nome ou slug..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Selecionar Estabelecimento ({filteredModalTenants.length})
                  </label>
                  <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {filteredModalTenants.map((biz) => {
                      const isSelected = selectedTenantId === biz.id;
                      return (
                        <button
                          key={biz.id}
                          type="button"
                          onClick={() => setSelectedTenantId(biz.id)}
                          className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#4285F4]/10 text-[#1A73E8]'
                              : 'hover:bg-gray-50 text-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <BusinessLogo url={biz.logoUrl} name={biz.name} size="xs" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{biz.name}</div>
                              <div className="text-[10px] font-mono text-gray-400 truncate">
                                /r/{biz.slug}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-[#4285F4] text-white flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setPlateToLink(null)}
                    className="py-2.5 px-4 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={linking || !selectedTenantId}
                    className="py-2.5 px-5 bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-lg text-xs font-semibold shadow-sm hover:shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {linking ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>{linking ? 'A vincular...' : 'Confirmar Vinculação'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PREVIEW / DOWNLOAD QR CODE */}
      {previewPlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-gray-200 shadow-2xl overflow-hidden text-center animate-fade-in">
            <div className="h-1.5 w-full google-color-bar" />
            <div className="p-6 space-y-4 relative">
              <button
                onClick={() => setPreviewPlate(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#4285F4]/10 text-[#1A73E8] rounded-full text-xs font-bold">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Placa QR #{previewPlate.id}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  {previewPlate.merchant_name || `Placa #${previewPlate.id}`}
                </h3>
                <p className="text-xs text-gray-500 font-mono break-all">
                  {getNfcRedirectUrl(previewPlate.id)}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 inline-block">
                <QRCodeSVG
                  id={`modal-plate-qr-${previewPlate.id}`}
                  value={getNfcRedirectUrl(previewPlate.id)}
                  size={210}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownloadPlateQr(previewPlate)}
                  className="flex-1 py-2.5 px-4 bg-[#4285F4] hover:bg-[#3367D6] text-white font-semibold rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PNG</span>
                </button>
                <button
                  onClick={() => setPreviewPlate(null)}
                  className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
