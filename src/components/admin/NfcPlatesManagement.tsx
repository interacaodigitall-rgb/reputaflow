import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Radio,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Link as LinkIcon,
  Unlink,
  QrCode,
  RefreshCw,
  Layers,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Business } from '../../types';
import { NfcPlate } from '../../types/nfc';
import {
  getNfcPlates,
  createNfcPlatesBatch,
  linkNfcPlate,
  unlinkNfcPlate,
  deleteNfcPlate,
  subscribeNfcPlates
} from '../../lib/nfcService';
import { getPublicReviewUrl, getNfcRedirectUrl } from '../../lib/urlHelper';
import { BusinessLogo } from '../common/BusinessLogo';

interface NfcPlatesManagementProps {
  businesses: Business[];
}

export const NfcPlatesManagement: React.FC<NfcPlatesManagementProps> = ({ businesses }) => {
  const businessesRef = useRef<Business[]>(businesses);
  useEffect(() => {
    businessesRef.current = businesses;
  }, [businesses]);

  const [plates, setPlates] = useState<NfcPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [copiedPlateId, setCopiedPlateId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal: Batch Generator
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [batchPrefix, setBatchPrefix] = useState<string>('');
  const [batchStartNumber, setBatchStartNumber] = useState<number>(1);
  const [batchPadDigits, setBatchPadDigits] = useState<number>(3);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);

  // Modal: Link / Activate Plate
  const [plateToLink, setPlateToLink] = useState<NfcPlate | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [customRedirectUrl, setCustomRedirectUrl] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);

  // Modal: Plate QR Code View
  const [qrModalPlate, setQrModalPlate] = useState<NfcPlate | null>(null);

  // Modal: Delete Plate
  const [plateToDelete, setPlateToDelete] = useState<NfcPlate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load and Subscribe to NFC Plates once on mount
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeNfcPlates(businessesRef.current, (loadedPlates) => {
      if (isMounted) {
        setPlates(loadedPlates);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Statistics
  const stats = useMemo(() => {
    const total = plates.length;
    const active = plates.filter((p) => p.status === 'active').length;
    const inactive = plates.filter((p) => p.status === 'inactive').length;
    const totalScans = plates.reduce((acc, p) => acc + (p.scan_count || 0), 0);
    const avgScans = active > 0 ? Math.round(totalScans / active) : 0;

    return { total, active, inactive, totalScans, avgScans };
  }, [plates]);

  // Filtered Plates
  const filteredPlates = useMemo(() => {
    return plates.filter((p) => {
      const matchSearch =
        p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.merchant_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.redirect_url || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? p.status === 'active'
          : p.status === 'inactive';

      return matchSearch && matchStatus;
    });
  }, [plates, searchTerm, statusFilter]);

  // Copy URL
  const handleCopyUrl = (plate: NfcPlate) => {
    const url = getNfcRedirectUrl(plate.id);
    navigator.clipboard.writeText(url);
    setCopiedPlateId(plate.id);
    showToast(`Link da Placa #${plate.id} copiado para a área de transferência!`);
    setTimeout(() => setCopiedPlateId(null), 2500);
  };

  // Batch Generation Submit
  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (batchQuantity < 1) {
      showToast('A quantidade deve ser de pelo menos 1 placa.', 'error');
      return;
    }

    setIsGeneratingBatch(true);
    try {
      const res = await createNfcPlatesBatch({
        quantity: Number(batchQuantity),
        prefix: batchPrefix.trim(),
        startNumber: Number(batchStartNumber),
        padDigits: Number(batchPadDigits)
      });

      if (res.success) {
        showToast(`Lote com ${res.createdCount} placas gerado com sucesso!`);
        setShowBatchModal(false);
        const updated = await getNfcPlates(businessesRef.current);
        setPlates(updated);
      } else {
        showToast(res.error || 'Erro ao gerar lote de placas.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado ao gerar lote.', 'error');
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  // Open Link Modal
  const handleOpenLinkModal = (plate: NfcPlate) => {
    setPlateToLink(plate);
    const mId = plate.merchant_id || (businesses.length > 0 ? businesses[0].id : '');
    setSelectedMerchantId(mId);

    if (plate.redirect_url) {
      setCustomRedirectUrl(plate.redirect_url);
    } else if (mId) {
      const biz = businesses.find((b) => b.id === mId);
      if (biz) {
        setCustomRedirectUrl(getPublicReviewUrl(biz.slug || biz.id));
      }
    }
  };

  // When merchant selection changes in modal
  const handleMerchantChange = (bizId: string) => {
    setSelectedMerchantId(bizId);
    const biz = businesses.find((b) => b.id === bizId);
    if (biz) {
      setCustomRedirectUrl(getPublicReviewUrl(biz.slug || biz.id));
    }
  };

  // Submit Link / Activate
  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateToLink) return;

    if (!selectedMerchantId) {
      showToast('Por favor, selecione um lojista.', 'error');
      return;
    }

    if (!customRedirectUrl.trim()) {
      showToast('Por favor, informe ou gere a URL de redirecionamento.', 'error');
      return;
    }

    setIsLinking(true);
    try {
      const res = await linkNfcPlate(plateToLink.id, selectedMerchantId, customRedirectUrl.trim());
      if (res.success) {
        showToast(`Placa #${plateToLink.id} vinculada e ativada com sucesso!`);
        setPlateToLink(null);
        const updated = await getNfcPlates(businessesRef.current);
        setPlates(updated);
      } else {
        showToast(res.error || 'Erro ao vincular placa.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao vincular placa.', 'error');
    } finally {
      setIsLinking(false);
    }
  };

  // Unlink Plate
  const handleUnlink = async (plate: NfcPlate) => {
    if (!confirm(`Deseja realmente desvincular a Placa #${plate.id}? Ela passará ao estado Inativa.`)) {
      return;
    }

    try {
      const res = await unlinkNfcPlate(plate.id);
      if (res.success) {
        showToast(`Placa #${plate.id} desvinculada.`);
        const updated = await getNfcPlates(businessesRef.current);
        setPlates(updated);
      } else {
        showToast(res.error || 'Erro ao desvincular.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao desvincular.', 'error');
    }
  };

  // Delete Plate
  const handleConfirmDelete = async () => {
    if (!plateToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteNfcPlate(plateToDelete.id);
      if (res.success) {
        showToast(`Placa #${plateToDelete.id} excluída com sucesso.`);
        setPlateToDelete(null);
        const updated = await getNfcPlates(businessesRef.current);
        setPlates(updated);
      } else {
        showToast(res.error || 'Erro ao excluir placa.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir placa.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans select-none">
      {/* Toast Banner */}
      {toastMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-md transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-500 hover:text-slate-800 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header with Title and Actions */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold">
              <Radio className="w-3.5 h-3.5" />
              <span>Hardware & QR Dinâmico</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Gestão de Placas NFC / QR Dinâmico
            </h1>
            <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
              Crie lotes de números de série, vincule fisicamente placas aos lojistas cadastrados e acompanhe o volume de leituras em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={async () => {
                const updated = await getNfcPlates(businessesRef.current);
                setPlates(updated);
                showToast('Lista de placas sincronizada!');
              }}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-700 cursor-pointer"
              title="Recarregar dados"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-indigo-900/40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Gerar Lote de Placas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Statistics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total de Placas
          </span>
          <div className="text-2xl font-black text-slate-900">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Cadastradas no sistema</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Placas Ativas
          </span>
          <div className="text-2xl font-black text-emerald-600">{stats.active}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Vinculadas a lojistas</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Placas Inativas
          </span>
          <div className="text-2xl font-black text-slate-500">{stats.inactive}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Disponíveis para entrega</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total de Leituras
          </span>
          <div className="text-2xl font-black text-indigo-600">{stats.totalScans}</div>
          <div className="text-[11px] text-indigo-500 mt-0.5">Scans NFC & QR realizados</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Média por Placa Ativa
          </span>
          <div className="text-2xl font-black text-slate-900">{stats.avgScans}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Leituras por ponto físico</div>
        </div>
      </div>

      {/* Table Card & Filter Bar */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Filter Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por ID (#001), Lojista..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setStatusFilter('all')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todas ({plates.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Ativas ({stats.active})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'inactive'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Inativas ({stats.inactive})
            </button>
          </div>
        </div>

        {/* Table Content */}
        {loading && plates.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-500">A carregar placas...</p>
          </div>
        ) : filteredPlates.length === 0 ? (
          <div className="p-12 text-center space-y-4 max-w-md mx-auto">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100">
              <Radio className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Nenhuma placa NFC encontrada</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {searchTerm || statusFilter !== 'all'
                  ? 'Nenhum resultado corresponde aos filtros aplicados.'
                  : 'Ainda não existem placas criadas. Clique em "Gerar Lote de Placas" para gerar os primeiros números de série.'}
              </p>
            </div>
            {plates.length === 0 && (
              <button
                onClick={() => setShowBatchModal(true)}
                className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Gerar Primeiro Lote (ex: 001 a 020)</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Serial / ID</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Lojista Vinculado</th>
                  <th className="py-3 px-4">Destino (Redirect URL)</th>
                  <th className="py-3 px-4 text-center">Leituras (Scans)</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlates.map((plate) => {
                  const isCopied = copiedPlateId === plate.id;

                  return (
                    <tr key={plate.id} className="hover:bg-slate-50/80 transition">
                      {/* Serial / ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-slate-900 text-indigo-400 font-mono font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                            #{plate.id}
                          </div>
                          <div>
                            <span className="font-mono font-extrabold text-slate-900 block">
                              Placa {plate.id}
                            </span>
                            <button
                              onClick={() => handleCopyUrl(plate)}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 mt-0.5 cursor-pointer"
                              title="Copiar rota /qr/[id]"
                            >
                              {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{isCopied ? 'Copiado!' : '/qr/' + plate.id}</span>
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {plate.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            Inativa
                          </span>
                        )}
                      </td>

                      {/* Merchant */}
                      <td className="py-3.5 px-4">
                        {plate.merchant_name ? (
                          <div className="flex items-center gap-2 min-w-0 max-w-[200px]">
                            <BusinessLogo
                              url={plate.merchant_logo_url}
                              name={plate.merchant_name}
                              size="xs"
                              rounded="rounded-lg"
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 truncate block">
                                {plate.merchant_name}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                ID: {plate.merchant_id}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            Sem lojista vinculado
                          </span>
                        )}
                      </td>

                      {/* Redirect URL */}
                      <td className="py-3.5 px-4 max-w-[220px]">
                        {plate.redirect_url ? (
                          <a
                            href={plate.redirect_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium truncate block flex items-center gap-1 group"
                            title={plate.redirect_url}
                          >
                            <span className="truncate">{plate.redirect_url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition" />
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Scans Count */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-xl font-mono font-bold text-xs bg-slate-100 text-slate-900 border border-slate-200">
                          {plate.scan_count || 0}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* QR Code view */}
                          <button
                            onClick={() => setQrModalPlate(plate)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title="Ver QR Code da Placa"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          {/* Link / Activate */}
                          <button
                            onClick={() => handleOpenLinkModal(plate)}
                            className="py-1 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition text-[11px] flex items-center gap-1 border border-indigo-200/60 cursor-pointer"
                            title="Vincular a um Lojista"
                          >
                            <LinkIcon className="w-3 h-3" />
                            <span>{plate.status === 'active' ? 'Alterar' : 'Vincular'}</span>
                          </button>

                          {/* Unlink if active */}
                          {plate.status === 'active' && (
                            <button
                              onClick={() => handleUnlink(plate)}
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition cursor-pointer border border-amber-200/60"
                              title="Desvincular (Passar para Inativa)"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => setPlateToDelete(plate)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer border border-rose-200/60"
                            title="Excluir Placa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL: BATCH GENERATOR                     */}
      {/* ========================================== */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Gerar Lote de Placas NFC</h3>
                  <p className="text-[11px] text-slate-500">Criação sequencial de códigos seriais</p>
                </div>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={batchQuantity}
                    onChange={(e) => setBatchQuantity(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ex: 10"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Número Inicial</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={batchStartNumber}
                    onChange={(e) => setBatchStartNumber(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ex: 1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prefixo (Opcional)</label>
                  <input
                    type="text"
                    value={batchPrefix}
                    onChange={(e) => setBatchPrefix(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ex: NFC- ou deixe vazio"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Dígitos com Zeros</label>
                  <select
                    value={batchPadDigits}
                    onChange={(e) => setBatchPadDigits(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={1}>1 dígito (1, 2, 3...)</option>
                    <option value={2}>2 dígitos (01, 02, 03...)</option>
                    <option value={3}>3 dígitos (001, 002, 003...)</option>
                    <option value={4}>4 dígitos (0001, 0002...)</option>
                  </select>
                </div>
              </div>

              {/* Preview Box */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                  Exemplo de Códigos Gerados
                </span>
                <p className="font-mono text-xs font-bold text-indigo-900">
                  {batchPrefix}
                  {String(batchStartNumber).padStart(batchPadDigits, '0')} ... até{' '}
                  {batchPrefix}
                  {String(batchStartNumber + batchQuantity - 1).padStart(batchPadDigits, '0')}
                </p>
                <p className="text-[10px] text-indigo-600">
                  As placas serão criadas com status inicial <strong>'Inativa'</strong> e 0 leituras.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingBatch}
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingBatch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isGeneratingBatch ? 'A gerar...' : 'Criar Lote'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: LINK / ACTIVATE PLATE               */}
      {/* ========================================== */}
      {plateToLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono font-bold">
                  #{plateToLink.id}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Vincular e Ativar Placa #{plateToLink.id}
                  </h3>
                  <p className="text-[11px] text-slate-500">Associe o número de série ao estabelecimento</p>
                </div>
              </div>
              <button
                onClick={() => setPlateToLink(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Selecione o Lojista / Comerciante
                </label>
                {businesses.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs">
                    Nenhum lojista cadastrado. Crie um comerciante primeiro no painel Super Admin.
                  </div>
                ) : (
                  <select
                    value={selectedMerchantId}
                    onChange={(e) => handleMerchantChange(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold cursor-pointer"
                  >
                    <option value="">Selecione um estabelecimento...</option>
                    {businesses.map((biz) => (
                      <option key={biz.id} value={biz.id}>
                        {biz.name} ({biz.category || 'Comércio'}) - ID: {biz.id}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  URL de Redirecionamento (Página de Avaliação)
                </label>
                <input
                  type="text"
                  required
                  value={customRedirectUrl}
                  onChange={(e) => setCustomRedirectUrl(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-[11px]"
                  placeholder="https://.../?b=slug"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Ao aproximar o smartphone da placa ou ler o QR Code, o cliente será direcionado para este link.
                </p>
              </div>

              {/* NFC Route Summary */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Link Dinâmico da Placa
                </span>
                <p className="font-mono text-xs font-bold text-slate-900">
                  {getNfcRedirectUrl(plateToLink.id)}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlateToLink(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLinking || businesses.length === 0}
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isLinking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isLinking ? 'A salvar...' : 'Salvar e Ativar Placa'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: QR CODE VIEW                        */}
      {/* ========================================== */}
      {qrModalPlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-5 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 font-mono">
                QR Code Placa #{qrModalPlate.id}
              </span>
              <button
                onClick={() => setQrModalPlate(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex justify-center items-center shadow-inner">
              <QRCodeSVG
                value={getNfcRedirectUrl(qrModalPlate.id)}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-900">
                {qrModalPlate.merchant_name || 'Placa sem lojista vinculado'}
              </p>
              <p className="text-[11px] font-mono text-slate-400 break-all">
                {getNfcRedirectUrl(qrModalPlate.id)}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => handleCopyUrl(qrModalPlate)}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Link</span>
              </button>
              <button
                onClick={() => setQrModalPlate(null)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: DELETE CONFIRMATION                 */}
      {/* ========================================== */}
      {plateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Excluir Placa #{plateToDelete.id}?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Esta ação removerá a placa permanentemente. O link /qr/{plateToDelete.id} deixará de funcionar.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPlateToDelete(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'A excluir...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
