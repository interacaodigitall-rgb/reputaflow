import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, LogIn, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export const LoginPage: React.FC = () => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(
          'Erro ao autenticar. Verifique os dados introduzidos e tente novamente.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200/90 shadow-md overflow-hidden transition-all duration-300">
        {/* Subtle Google 4-color top bar (#4285F4, #EA4335, #FBBC05, #34A853) */}
        <div className="h-1.5 w-full google-color-bar" />

        <div className="p-8 sm:p-10 space-y-6">
          {/* Logo and Brand Header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <BrandLogo size="xl" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                Aceda à sua plataforma
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
                Controle a reputação do seu negócio, recupere clientes insatisfeitos e gerencie as avaliações da sua empresa.
              </p>
            </div>
          </div>

          {/* Error / Alert Section */}
          {error && (
            <div className="p-3.5 bg-[#EA4335]/10 border border-[#EA4335]/25 text-[#C5221F] rounded-lg text-xs font-medium flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-[#EA4335] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="email-address"
                  className="block text-xs font-semibold text-gray-700 mb-1.5"
                >
                  Endereço de E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 pr-3.5 py-2.5 w-full text-sm text-gray-900 bg-white rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-400"
                    placeholder="Introduza o seu e-mail"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-gray-700"
                  >
                    Senha
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 py-2.5 w-full text-sm text-gray-900 bg-white rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-400"
                    placeholder="Introduza a sua senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer transition p-1 rounded-md"
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

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#4285F4] hover:bg-[#3367D6] active:bg-[#2A56C6] text-white font-semibold rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>{loading ? 'A autenticar...' : 'Entrar na Conta'}</span>
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-gray-400 font-medium">
                Ou se preferir
              </span>
            </div>
          </div>

          {/* Google SSO Button */}
          <div>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium rounded-lg text-sm border border-gray-300 shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer"
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

          {/* Footnote branding */}
          <div className="text-center pt-2 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 font-medium">
              © {new Date().getFullYear()} GlowfyHub. Todos os direitos reservados.
            </p>
            <p className="text-[10px] text-gray-400/90 mt-0.5">
              Operação internacional: Brasil (R$) &amp; Europa (€)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
