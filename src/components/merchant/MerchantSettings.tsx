import React, { useState } from 'react';
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
  Database
} from 'lucide-react';
import { Business } from '../../types';
import { updateBusiness, uploadImage } from '../../lib/dbService';
import { getPublicReviewUrl } from '../../lib/urlHelper';
import { getSupabaseAnonKey, setSupabaseAnonKey, getSupabaseClient } from '../../lib/supabaseClient';

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

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Password alteration state
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState('');

  // Supabase migration state
  const [supabaseAnonKeyInput, setSupabaseAnonKeyInput] = useState(getSupabaseAnonKey());
  const [supabaseStatus, setSupabaseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [supabaseMsg, setSupabaseMsg] = useState('');

  const handleSaveSupabaseKey = (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseAnonKey(supabaseAnonKeyInput);
    const client = getSupabaseClient();
    if (client) {
      setSupabaseStatus('success');
      setSupabaseMsg('Supabase conectado com sucesso (Projeto: ltpxwagdnrtuulzhfdjk)!');
    } else {
      setSupabaseStatus('error');
      setSupabaseMsg('Chave Anon Inválida.');
    }
    setTimeout(() => setSupabaseStatus('idle'), 4000);
  };

  const publicReviewUrl = getPublicReviewUrl(slug || business.slug);

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingLogo(true);
      try {
        const url = await uploadImage(file);
        setLogoUrl(url);
      } catch (err: any) {
        console.error('Logo upload error:', err);
        alert('Erro ao enviar imagem. Verifique a conexão.');
      } finally {
        setUploadingLogo(false);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
      const updatedData: Partial<Business> = {
        name,
        slug: cleanSlug,
        category,
        phone,
        email,
        address,
        logoUrl: logoUrl || undefined,
        googleReviewUrl: googleReviewUrl || undefined,
        currency
      };
      await updateBusiness(business.id, updatedData);
      setSavedSuccess(true);
      if (onBusinessUpdated) {
        onBusinessUpdated({ ...business, ...updatedData });
      }
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err) {
      console.error('Error saving business settings:', err);
      alert('Erro ao guardar as alterações.');
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
    navigator.clipboard.writeText(publicReviewUrl);
    alert('Link público de avaliação copiado com sucesso!');
  };

  const handleDownloadQr = () => {
    const svg = document.getElementById('establishment-qr-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 80;
      canvas.height = img.height + 120;
      if (ctx) {
        // Draw white card background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw title
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(business.name, canvas.width / 2, 45);

        // Draw subtitle
        ctx.fillStyle = '#64748B';
        ctx.font = '14px sans-serif';
        ctx.fillText('Avalie a sua experiência', canvas.width / 2, 72);

        // Draw QR
        ctx.drawImage(img, 40, 95);

        // Download
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `qrcode-avaliacao-${business.slug}.png`;
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Container */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
            <form onSubmit={handleSave} className="space-y-5">
            {savedSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Configurações atualizadas com sucesso na base de dados!</span>
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
                  <div className="flex gap-2 items-center mb-2">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 text-xs font-bold">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <label className="cursor-pointer py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Carregar Ficheiro</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileUpload}
                        className="hidden"
                      />
                    </label>
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
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Link Oficial do Google Reviews
                </h2>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full">
                  Secção 4
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Insira o link oficial "Pedir avaliações" do seu perfil de empresa no Google (ex: https://g.page/r/.../review). O sistema disponibiliza o link de forma neutra aos clientes.
              </p>

              <div>
                <input
                  type="url"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/exemplo-perfil/review"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-200 transition flex items-center gap-2 disabled:opacity-50"
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
                className="py-2.5 px-5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition whitespace-nowrap"
              >
                {passwordStatus === 'loading' ? 'A atualizar...' : 'Alterar Senha'}
              </button>
            </div>
          </form>
        </div>

        {/* Section: Supabase Migration */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <span>Migração Supabase (Imagens & Database)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Projeto ID: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono font-semibold text-emerald-700">ltpxwagdnrtuulzhfdjk</code>. Insira a sua chave Anon Key do Supabase para ativar o upload direto de imagens para o Supabase Storage.
          </p>

          <form onSubmit={handleSaveSupabaseKey} className="space-y-3">
            {supabaseStatus === 'success' && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{supabaseMsg}</span>
              </div>
            )}
            {supabaseStatus === 'error' && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-rose-600" />
                <span>{supabaseMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Insira a sua Supabase Anon Key (eyJ...)"
                value={supabaseAnonKeyInput}
                onChange={(e) => setSupabaseAnonKeyInput(e.target.value)}
                className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 font-mono outline-none"
              />
              <button
                type="submit"
                className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition whitespace-nowrap"
              >
                Conectar Supabase
              </button>
            </div>
            <div className="text-[11px] text-slate-400">
              Certifique-se de criar um bucket público chamado <code className="text-slate-600 font-mono">uploads</code> no seu painel do Supabase Storage.
            </div>
          </form>
        </div>
      </div>

        {/* Right Col: QR Code Card & Direct Test (Section 1 & 2) */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center justify-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>QR Code para Mesas & Balcão</span>
            </h2>
            <p className="text-xs text-slate-500">
              Posicione este QR Code impresso no balcão ou nas mesas para o cliente avaliar sem precisar de instalar nada.
            </p>

            {/* QR Code Canvas */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              <QRCodeSVG
                id="establishment-qr-svg"
                value={publicReviewUrl}
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="space-y-2">
              <button
                onClick={handleDownloadQr}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Descarregar Placa PNG</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Link de Avaliação</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={onOpenReviewPreview}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1"
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
