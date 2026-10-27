import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import {
  Settings,
  Building,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  QrCode,
  Download,
  Copy,
  CheckCircle,
  Save,
  Link,
  Shield,
  Upload,
  Loader2,
  Trash2,
  AlertTriangle,
  Check,
  Radio,
  Sparkles,
  Globe,
  Wand2,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Business } from '../../types';
import { NfcPlate } from '../../types/nfc';
import { updateBusiness, uploadImage } from '../../lib/dbService';
import { uploadBusinessLogo } from '../../lib/supabase';
import {
  getPublicReviewUrl,
  getNfcRedirectUrl,
  normalizeGoogleReviewUrl,
  convertGoogleMapsToReviewUrl,
  extractGooglePlaceId,
  GoogleReviewUrlNormalization
} from '../../lib/urlHelper';
import { getNfcPlates } from '../../lib/nfcService';
import { BusinessLogo } from '../common/BusinessLogo';

interface MerchantSettingsProps {
  business: Business;
  onBusinessUpdated?: (updated: Business) => void;
  onOpenReviewPreview: () => void;
}

export const MerchantSettings: React.FC<MerchantSettingsProps> = ({
  business,
  onBusinessUpdated,
  onOpenReviewPreview
}) => {
  const { changePassword } = useAuth();
  const [name, setName] = useState(business.name);
  const [slug, setSlug] = useState(business.slug);
  const [category, setCategory] = useState(business.category || '');
  const [phone, setPhone] = useState(business.phone);
  const [email, setEmail] = useState(business.email);
  const [address, setAddress] = useState(business.address);
  const [logoUrl, setLogoUrl] = useState(business.logoUrl || '');
  const [googleReviewUrl, setGoogleReviewUrl] = useState(business.googleReviewUrl || '');
  const [currency, setCurrency] = useState<'EUR' | 'BRL'>(business.currency || 'EUR');

  useEffect(() => {
    setName(business.name);
    setSlug(business.slug);
    setCategory(business.category || '');
    setPhone(business.phone);
    setEmail(business.email);
    setAddress(business.address);
    setLogoUrl(business.logoUrl || '');
    setGoogleReviewUrl(business.googleReviewUrl || '');
    setCurrency(business.currency || 'EUR');
  }, [business]);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFeedback, setLogoFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Password alteration state
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState('');

  // Copy status
  const [copiedLink, setCopiedLink] = useState(false);

  // Dynamic linked NFC / QR Plate state
  const [linkedPlate, setLinkedPlate] = useState<NfcPlate | null>(null);
  const [loadingPlate, setLoadingPlate] = useState(true);
  const [qrMode, setQrMode] = useState<'plate' | 'direct'>('plate');

  // Smart Google Link Converter states & handlers (Passo 1)
  const [convertingGoogleLink, setConvertingGoogleLink] = useState(false);
  const [googleToast, setGoogleToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [googleLinkStatus, setGoogleLinkStatus] = useState<GoogleReviewUrlNormalization | null>(() => {
    return business.googleReviewUrl ? normalizeGoogleReviewUrl(business.googleReviewUrl) : null;
  });

  const handleGoogleLinkInput = (rawInput: string) => {
    setGoogleReviewUrl(rawInput);
    if (!rawInput.trim()) {
      setGoogleLinkStatus(null);
      return;
    }

    const norm = normalizeGoogleReviewUrl(rawInput.trim());
    setGoogleLinkStatus(norm);

    // If user pastes an exact Place ID or embedded Place ID directly into the input, auto-convert smoothly
    if (norm.isOptimized && norm.url !== rawInput.trim() && norm.detectedType !== 'maps_generic') {
      setGoogleReviewUrl(norm.url);
      setGoogleToast({
        type: 'success',
        text: 'Link do Google Reviews configurado e otimizado com sucesso!'
      });
      setTimeout(() => setGoogleToast(null), 4000);
    }
  };

  const handleConvertGoogleLink = async () => {
    if (!googleReviewUrl.trim()) {
      setGoogleToast({
        type: 'error',
        text: 'Por favor, cole um link do Google Maps ou Place ID para converter.'
      });
      setTimeout(() => setGoogleToast(null), 3500);
      return;
    }

    setConvertingGoogleLink(true);
    setGoogleToast(null);

    try {
      const result = await convertGoogleMapsToReviewUrl(googleReviewUrl);
      if (result.success && result.reviewUrl) {
        setGoogleReviewUrl(result.reviewUrl);
        const norm = normalizeGoogleReviewUrl(result.reviewUrl);
        setGoogleLinkStatus(norm);
        setGoogleToast({
          type: 'success',
          text: 'Link do Google Reviews configurado e otimizado com sucesso!'
        });
        setTimeout(() => setGoogleToast(null), 4500);
      } else {
        setGoogleToast({
          type: 'error',
          text: result.message || 'Não foi possível extrair o link oficial do Google. Verifique a URL.'
        });
        setTimeout(() => setGoogleToast(null), 4000);
      }
    } catch (err: any) {
      setGoogleToast({
        type: 'error',
        text: 'Erro ao converter link: ' + (err.message || 'Tente novamente.')
      });
      setTimeout(() => setGoogleToast(null), 4000);
    } finally {
      setConvertingGoogleLink(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchLinkedPlate = async () => {
      setLoadingPlate(true);
      try {
        const plates = await getNfcPlates([business]);
        const found = plates.find((p) => {
          if (p.merchant_id && (p.merchant_id === business.id || p.merchant_id === business.slug)) {
            return true;
          }
          if (p.redirect_url && business.slug && p.redirect_url.includes(business.slug)) {
            return true;
          }
          return false;
        });
        if (isMounted) {
          setLinkedPlate(found || null);
          setLoadingPlate(false);
        }
      } catch (err) {
        console.warn('Error fetching linked NFC plate:', err);
        if (isMounted) setLoadingPlate(false);
      }
    };

    fetchLinkedPlate();
    return () => {
      isMounted = false;
    };
  }, [business.id, business.slug]);

  const publicReviewUrl = getPublicReviewUrl(slug || business.slug);
  const plateQrUrl = linkedPlate ? getNfcRedirectUrl(linkedPlate.id) : '';
  const currentQrUrl = (linkedPlate && qrMode === 'plate') ? plateQrUrl : publicReviewUrl;

  const handleLogoFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setLogoFeedback(null);

    try {
      // Modular resilient upload helper (Supabase Storage -> Server API /api/upload -> Optimized Base64)
      const publicUrl = await uploadBusinessLogo(file, business.id);

      if (!publicUrl) {
        throw new Error('Não foi possível obter o endereço da imagem enviada.');
      }

      // Sincroniza o estado da aplicação e banco local/API
      await updateBusiness(business.id, { logoUrl: publicUrl });

      setLogoUrl(publicUrl);
      if (onBusinessUpdated) {
        onBusinessUpdated({ ...business, logoUrl: publicUrl });
      }

      setLogoFeedback({ type: 'success', message: 'Logótipo enviado e atualizado com sucesso!' });
      setTimeout(() => setLogoFeedback(null), 4000);
    } catch (err: any) {
      console.error('Logo upload error:', err);
      setLogoFeedback({
        type: 'error',
        message: 'Erro ao carregar logótipo: ' + (err.message || 'Tente novamente com outra imagem.')
      });
    } finally {
      if (event.target) {
        event.target.value = '';
      }
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoUrl('');
    await updateBusiness(business.id, { logoUrl: '' });
    if (onBusinessUpdated) {
      onBusinessUpdated({ ...business, logoUrl: '' });
    }
    setLogoFeedback({ type: 'success', message: 'Logótipo removido.' });
    setTimeout(() => setLogoFeedback(null), 3000);
  };

  // Global Toast Feedback (Passo 3)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setSaveError(null);

    try {
      const cleanSlug = (slug || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');

      // Passo 2: Normalização do Link do Google Reviews antes de salvar
      let normalizedGoogleUrl = (googleReviewUrl || '').trim();
      let wasGoogleUrlOptimized = false;
      if (normalizedGoogleUrl) {
        const norm = normalizeGoogleReviewUrl(normalizedGoogleUrl);
        if (norm.url) {
          normalizedGoogleUrl = norm.url;
          if (norm.isOptimized) {
            wasGoogleUrlOptimized = true;
          }
        }
      }

      // PASSO 1: BLINDAGEM DO PAYLOAD DE UPDATE
      // Nunca envia id, tenant_id ou created_at no corpo do update
      const updatedData: Partial<Business> = {
        name: (name || '').trim(),
        category: (category || '').trim(),
        phone: (phone || '').trim(),
        email: (email || '').trim(),
        address: (address || '').trim(),
        logoUrl: (logoUrl || '').trim() || undefined,
        googleReviewUrl: normalizedGoogleUrl || undefined,
        currency,
        status: business.status || 'active'
      };

      if (cleanSlug && cleanSlug !== business.slug) {
        updatedData.slug = cleanSlug;
      }

      // Salva no banco de dados com ID rigorosamente preservado na cláusula .eq('id', business.id)
      await updateBusiness(business.id, updatedData);

      setGoogleReviewUrl(normalizedGoogleUrl);
      setSavedSuccess(true);
      setToastMessage('Alterações guardadas com sucesso!');
      setTimeout(() => setToastMessage(null), 5000);

      if (wasGoogleUrlOptimized) {
        setGoogleToast({
          type: 'success',
          text: 'Link do Google Reviews configurado e otimizado com sucesso!'
        });
        setTimeout(() => setGoogleToast(null), 4500);
      }

      // PASSO 2: PRESERVAÇÃO DA LISTAGEM E ESTADO LOCAL
      // Preserva estritamente o id, ownerId e createdAt do estabelecimento ativo
      const updatedBusinessRecord: Business = {
        ...business,
        ...updatedData,
        id: business.id,
        ownerId: business.ownerId,
        status: business.status || 'active',
        createdAt: business.createdAt
      };

      if (onBusinessUpdated) {
        onBusinessUpdated(updatedBusinessRecord);
      }
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving business settings:', err);
      const errMsg = 'Erro ao guardar as alterações: ' + (err.message || 'Tente novamente.');
      setSaveError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.length < 6) {
      setPasswordStatus('error');
      setPasswordError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    setPasswordStatus('loading');
    try {
      await changePassword(newPassword);
      setPasswordStatus('success');
      setNewPassword('');
      setTimeout(() => setPasswordStatus('idle'), 4000);
    } catch (err: any) {
      console.error(err);
      setPasswordStatus('error');
      setPasswordError(err.message || 'Erro ao alterar a senha. Tente novamente.');
    }
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(currentQrUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  const handleDownloadQr = () => {
    const svg = document.getElementById('establishment-qr-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 460;
      canvas.height = 560;
      if (ctx) {
        // Draw white card background with rounded aesthetics
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header brand bar
        ctx.fillStyle = '#4F46E5';
        ctx.fillRect(0, 0, canvas.width, 12);

        // Title: Business Name
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(business.name, canvas.width / 2, 55);

        // Subtitle or Plate Badge
        if (linkedPlate && qrMode === 'plate') {
          ctx.fillStyle = '#4F46E5';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(`PLACA FÍSICA OFICIAL #${linkedPlate.id}`, canvas.width / 2, 82);

          ctx.fillStyle = '#64748B';
          ctx.font = '13px sans-serif';
          ctx.fillText('Aponte a câmara do telemóvel para avaliar', canvas.width / 2, 105);
        } else {
          ctx.fillStyle = '#64748B';
          ctx.font = '14px sans-serif';
          ctx.fillText('Avalie a sua experiência no Google', canvas.width / 2, 85);
        }

        // Draw QR Matrix centered (240x240)
        ctx.drawImage(img, (canvas.width - 240) / 2, 125, 240, 240);

        // URL display box
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(40, 395, canvas.width - 80, 50);
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.strokeRect(40, 395, canvas.width - 80, 50);

        ctx.fillStyle = '#4F46E5';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(currentQrUrl, canvas.width / 2, 425);

        // Footer note
        ctx.fillStyle = '#94A3B8';
        ctx.font = '11px sans-serif';
        ctx.fillText('ReputaFlow • Hardware NFC & QR Dinâmico', canvas.width / 2, 490);

        // Download PNG
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = linkedPlate && qrMode === 'plate'
          ? `placa-oficial-${business.slug}-${linkedPlate.id}.png`
          : `qrcode-avaliacao-${business.slug}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          <span>Configurações do Estabelecimento</span>
        </h1>
        <p className="text-xs text-slate-500">
          Personalize a identidade do seu espaço, configure o link do Google e obtenha o QR Code para os seus clientes
        </p>
      </div>

      {/* Floating Success Toast (Passo 3) */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Container */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
            <form onSubmit={handleSave} className="space-y-5">
              {savedSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Alterações guardadas com sucesso!</span>
                </div>
              )}

              {saveError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                  Dados Principais
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome do Estabelecimento *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Slug / Identificador no Link *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Usado na URL de avaliação: ?b={slug}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Segmento / Categoria
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Restaurante, Clínica..."
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Telefone / WhatsApp *
                    </label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      E-mail do Estabelecimento
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço Completo
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - Estado"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Logótipo do Estabelecimento
                    </label>

                    {logoFeedback && (
                      <div
                        className={`mb-2 p-2.5 rounded-xl text-xs flex items-center gap-1.5 font-medium ${
                          logoFeedback.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {logoFeedback.type === 'success' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <span>{logoFeedback.message}</span>
                      </div>
                    )}

                    <div className="flex gap-2 items-center mb-2">
                      {logoUrl ? (
                        <div className="relative group shrink-0">
                          <BusinessLogo url={logoUrl} name={name} size="md" rounded="rounded-xl" className="w-12 h-12" />
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1 shadow-sm transition"
                            title="Remover logótipo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <BusinessLogo url="" name={name} size="md" rounded="rounded-xl" className="w-12 h-12" />
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="py-2.5 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer shadow-2xs"
                      >
                        {uploadingLogo ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            <span>A enviar logótipo...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            <span>Carregar Imagem / Logo</span>
                          </>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileUpload}
                        style={{ display: 'none' }}
                      />
                    </div>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="Ou cole o link direto https://exemplo.com/logo.png"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Exibido no topo da página de avaliação pública do seu negócio
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Moeda do Estabelecimento
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as 'EUR' | 'BRL')}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="EUR">Euro (€) - Europa</option>
                      <option value="BRL">Real (R$) - Brasil</option>
                    </select>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Define o símbolo monetário apresentado nos relatórios e faturas
                    </span>
                  </div>
                </div>
              </div>

              {/* Google Review Integration (Section 4) */}
              <div className="space-y-3.5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Gerador & Link Oficial do Google Reviews
                    </h2>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full">
                      Secção 4
                    </span>
                  </div>

                  {googleLinkStatus?.isOptimized && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Formato Oficial de 5 Estrelas</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Cole o link do Google Maps (ex: <span className="font-mono text-slate-700 font-semibold">maps.app.goo.gl/...</span> ou <span className="font-mono text-slate-700 font-semibold">google.com/maps</span>), link do perfil (<span className="font-mono text-slate-700 font-semibold">g.page/.../review</span>) ou Place ID direto. O conversor nativo do ReputaFlow converterá para o formato oficial que abre diretamente a caixa de 5 estrelas no telemóvel do cliente.
                </p>

                {/* Toast de Conversão / Otimização */}
                {googleToast && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in ${
                      googleToast.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : googleToast.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {googleToast.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{googleToast.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoogleToast(null)}
                      className="text-slate-400 hover:text-slate-600 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Input & Converter Action */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="url"
                        value={googleReviewUrl}
                        onChange={(e) => handleGoogleLinkInput(e.target.value)}
                        onBlur={() => {
                          if (googleReviewUrl.trim()) {
                            const norm = normalizeGoogleReviewUrl(googleReviewUrl.trim());
                            if (norm.isOptimized && norm.url !== googleReviewUrl.trim() && norm.detectedType !== 'maps_generic') {
                              setGoogleReviewUrl(norm.url);
                              setGoogleLinkStatus(norm);
                              setGoogleToast({
                                type: 'success',
                                text: 'Link do Google Reviews configurado e otimizado com sucesso!'
                              });
                              setTimeout(() => setGoogleToast(null), 4000);
                            }
                          }
                        }}
                        placeholder="Cole aqui o link do Maps (maps.app.goo.gl/...), perfil ou Place ID"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono pr-8"
                      />
                      {googleReviewUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setGoogleReviewUrl('');
                            setGoogleLinkStatus(null);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                          title="Limpar campo"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={convertingGoogleLink || !googleReviewUrl.trim()}
                      onClick={handleConvertGoogleLink}
                      className="py-2.5 px-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0 min-h-[38px] cursor-pointer"
                    >
                      {convertingGoogleLink ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>A converter...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Converter Link do Maps</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Contextual Status / Converter Hint */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>
                        Formato oficial recomendado: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono text-[10px]">search.google.com/local/writereview?placeid=...</code>
                      </span>
                    </div>

                    {googleReviewUrl.trim() && (
                      <a
                        href={googleReviewUrl.startsWith('http') ? googleReviewUrl : `https://${googleReviewUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Testar Link do Google</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-200 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'A guardar...' : 'Guardar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section: Password Change (Required by user) */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <span>Segurança & Alteração de Senha</span>
            </h2>
            <p className="text-xs text-slate-500">
              Altere a senha de acesso à plataforma para garantir a segurança da sua conta.
            </p>

            <form onSubmit={handleChangePassword} className="space-y-3">
              {passwordStatus === 'success' && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Senha alterada com sucesso!</span>
                </div>
              )}
              {passwordStatus === 'error' && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-rose-600" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  placeholder="Nova senha (mínimo 6 caracteres)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={passwordStatus === 'loading'}
                  className="py-2.5 px-5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition whitespace-nowrap cursor-pointer"
                >
                  {passwordStatus === 'loading' ? 'A atualizar...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Col: QR Code Card & Direct Test (Section 1 & 2) */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900 flex items-center justify-center gap-2">
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>QR Code para Mesas & Balcão</span>
              </h2>
              <p className="text-xs text-slate-500">
                Posicione este QR Code impresso no balcão ou nas mesas para o cliente avaliar instantaneamente.
              </p>
            </div>

            {/* Linked Physical Plate Badge & Switcher */}
            {loadingPlate ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>A verificar placas NFC vinculadas...</span>
              </div>
            ) : linkedPlate ? (
              <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-2xl p-3.5 text-left space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 text-white rounded-xl text-xs font-bold">
                    <Radio className="w-3.5 h-3.5" />
                    <span>Placa Vinculada #{linkedPlate.id}</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
                    Ativa • {linkedPlate.scan_count || 0} leituras
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Este estabelecimento está associado à placa física do lote. O QR Code abaixo é gerado com o URL exclusivo do seu dispositivo.
                </p>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setQrMode('plate')}
                    className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                      qrMode === 'plate'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Placa #{linkedPlate.id} (Recomendado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrMode('direct')}
                    className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                      qrMode === 'direct'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Link Direto (?b={slug})
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                  <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                  <span>QR Code Padrão do Estabelecimento</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Nenhuma placa física de lote atribuída ainda. Pode solicitar ou associar uma placa no menu Super Admin.
                </p>
              </div>
            )}

            {/* QR Code Canvas */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              <QRCodeSVG
                id="establishment-qr-svg"
                value={currentQrUrl}
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>

            {/* URL string debug / verification badge */}
            <div className="text-[10px] font-mono text-indigo-700 bg-indigo-50/70 border border-indigo-100 rounded-xl py-1.5 px-3 truncate max-w-full font-semibold select-all" title={currentQrUrl}>
              {currentQrUrl}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {linkedPlate && qrMode === 'plate'
                    ? `Descarregar Placa PNG #${linkedPlate.id}`
                    : 'Descarregar Placa PNG'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className={`w-full py-2 px-4 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                  copiedLink
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Link Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Link ({qrMode === 'plate' && linkedPlate ? `Placa #${linkedPlate.id}` : 'URL'})</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenReviewPreview}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Ver página pública como cliente</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const EstablishmentSettings = MerchantSettings;
