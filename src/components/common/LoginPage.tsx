import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Mail,
  Lock,
  LogIn,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Star,
  ShieldCheck,
  QrCode,
  BarChart3,
  TrendingUp
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { restoreDefaultDocumentMeta } from '../../lib/documentMeta';

const GROWTH_BARS = [
  { month: 'Out', height: 34 },
  { month: 'Nov', height: 46 },
  { month: 'Dez', height: 58 },
  { month: 'Jan', height: 70 },
  { month: 'Fev', height: 84 },
  { month: 'Mar', height: 100, current: true }
];

const VALUE_PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Blindagem de Reputação',
    description: 'Recupere clientes insatisfeitos antes de irem para o Google.'
  },
  {
    icon: QrCode,
    title: 'Placas NFC & QR Code',
    description: 'Avaliação em 1 toque diretamente no balcão.'
  },
  {
    icon: BarChart3,
    title: 'Painel em Tempo Real',
    description: 'Acompanhe feedbacks e desempenho da sua equipa.'
  }
];

export const LoginPage: React.FC = () => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    restoreDefaultDocumentMeta();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err?.code === 'auth/wrong-password' || err?.message?.includes('Invalid login credentials')) {
        setError('Credenciais incorretas. Por favor, verifique o e-mail e a senha.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('O e-mail introduzido não é válido.');
      } else if (err?.code === 'auth/user-disabled') {
        setError('Esta conta foi desativada pelo administrador.');
      } else {
        setError('Erro ao autenticar. Verifique os dados introduzidos e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-white font-sans">
      {/* Coluna Esquerda (50% Desktop | 100% Mobile | Fundo Branco #FFFFFF) */}
      <div className="flex flex-col justify-center bg-[#FFFFFF] min-h-screen relative">
        <div className="max-w-md w-full mx-auto px-8 py-12 flex flex-col justify-center gap-8">
          {/* Logo & Cabeçalho */}
          <div className="space-y-4">
            <div className="flex justify-start">
              <BrandLogo size="lg" className="!w-24 !h-24 -ml-1" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 leading-tight">
                Aceda à sua plataforma
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Gerencie a reputação da sua empresa, recupere clientes insatisfeitos e impulsione avaliações no Google.
              </p>
            </div>
          </div>

          {/* Alerta de Erro */}
          {error && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Formulário de Autenticação */}
          <form className="space-y-5" onSubmit={handleSubmit} autoComplete="off">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="email-address"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Endereço de E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-10 pr-4 w-full text-sm text-slate-900 bg-slate-50/50 rounded-xl border border-slate-200 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 transition-all placeholder:text-slate-400"
                    placeholder="nome@empresa.pt"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Senha
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-10 pr-11 w-full text-sm text-slate-900 bg-slate-50/50 rounded-xl border border-slate-200 outline-none focus:bg-white focus:border-amber-500/80 focus:ring-4 focus:ring-amber-400/15 transition-all placeholder:text-slate-400"
                    placeholder="Introduza a sua senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer transition p-1.5 rounded-lg"
                    title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold text-sm shadow-sm transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{loading ? 'A autenticar...' : 'Entrar na Conta'}</span>
            </button>
          </form>

          {/* Divisor Discreto */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-slate-400 font-medium">
                Ou continue com
              </span>
            </div>
          </div>

          {/* Botão Google SSO */}
          <div>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full h-12 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm border border-slate-200 shadow-2xs transition-all duration-150 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.275c0-.85-.075-1.665-.215-2.45H12v4.635h6.445c-.28 1.495-1.125 2.765-2.395 3.615v3.005h3.875c2.265-2.085 3.565-5.155 3.565-8.805z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.955-1.075 7.94-2.92l-3.875-3.005c-1.075.72-2.45 1.145-4.065 1.145-3.125 0-5.775-2.11-6.72-4.945H1.275v3.1C3.25 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.275c-.24-.72-.38-1.49-.38-2.275s.14-1.555.38-2.275v-3.1H1.275C.465 8.24 0 10.065 0 12s.465 3.76 1.275 5.375l4.005-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.775c1.76 0 3.34.605 4.585 1.795l3.44-3.44C17.95 1.19 15.235 0 12 0 7.31 0 3.25 2.7 1.275 6.625l4.005 3.1C6.225 6.885 8.875 4.775 12 4.775z"
                />
              </svg>
              <span>Entrar com conta Google</span>
            </button>
          </div>

          {/* Rodapé Limpo */}
          <div className="pt-4 border-t border-slate-100 text-center space-y-1">
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} GlowfyHub · Todos os direitos reservados.
            </p>
            <p className="text-[11px] text-slate-400">
              Operação internacional: Europa (€) · Brasil (R$)
            </p>
          </div>
        </div>
      </div>

      {/* Coluna Direita (50% Desktop | Oculta em Mobile | Fundo Escuro Sofisticado #0B1120) */}
      <div className="hidden lg:flex relative flex-col justify-center overflow-hidden bg-[#0B1120] bg-gradient-to-br from-[#0B1120] via-[#0F172A] to-[#090E1A] px-12 xl:px-16 py-12 text-white">
        {/* Brilho Radial Suave ao Fundo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 w-[460px] h-[460px] rounded-full bg-blue-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -left-20 w-[380px] h-[380px] rounded-full bg-amber-400/10 blur-3xl"
        />

        <div className="relative z-10 max-w-lg mx-auto w-full space-y-8">
          {/* Headline de Autoridade */}
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-blue-300/90">
              Gestão de Reputação &amp; Google Reviews
            </p>
            <h2 className="text-3xl xl:text-[34px] font-bold tracking-tight leading-[1.18] text-white [text-wrap:balance]">
              Transforme cada cliente satisfeito em avaliações 5 estrelas no Google.
            </h2>
          </div>

          {/* Card Visual Flutuante (Glassmorphism) */}
          <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-6 space-y-5 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-0.5" aria-label="Avaliação 4.9 de 5 estrelas">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className="w-4 h-4 fill-[#FBBC05] text-[#FBBC05]"
                    />
                  ))}
                </div>
                <span className="text-lg font-bold text-white tabular-nums tracking-tight">
                  4.9
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Filtro Inteligente Ativo</span>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              &ldquo;Atendimento impecável do início ao fim. O processo de avaliação pelo QR Code no balcão levou menos de 10 segundos.&rdquo;
            </p>

            {/* Gráfico Minimalista de Crescimento de Reputação */}
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Crescimento de avaliações 5 estrelas</span>
                <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold tabular-nums">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +184% em 90 dias
                </span>
              </div>

              <div className="grid grid-cols-6 items-end gap-2.5 h-20 pt-2">
                {GROWTH_BARS.map((bar) => (
                  <div key={bar.month} className="flex flex-col items-center gap-1.5 h-full justify-end">
                    <div
                      className={`w-full rounded-md transition-all ${
                        bar.current
                          ? 'bg-gradient-to-t from-blue-500 to-blue-400 shadow-sm shadow-blue-500/30'
                          : 'bg-white/15'
                      }`}
                      style={{ height: `${bar.height}%` }}
                    />
                    <span className="text-[11px] text-slate-400 tabular-nums">{bar.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Métricas Resumo */}
            <div className="grid grid-cols-3 divide-x divide-white/10 pt-4 border-t border-white/10 text-left">
              <div className="pr-3">
                <div className="text-base font-bold text-white tabular-nums">+428</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Novas 5★ no Google</div>
              </div>
              <div className="px-3">
                <div className="text-base font-bold text-emerald-300 tabular-nums">92%</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Casos recuperados</div>
              </div>
              <div className="pl-3">
                <div className="text-base font-bold text-amber-300 tabular-nums">12s</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Tempo por avaliação</div>
              </div>
            </div>
          </div>

          {/* Lista de 3 Pilares */}
          <div className="space-y-4 pt-1">
            {VALUE_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div key={pillar.title} className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-blue-300 shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-white tracking-wide">
                      {pillar.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {pillar.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
