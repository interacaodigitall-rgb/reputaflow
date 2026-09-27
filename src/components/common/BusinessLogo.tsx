import React, { useState, useEffect } from 'react';

interface BusinessLogoProps {
  url?: string | null;
  name?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  rounded?: string;
}

export const BusinessLogo: React.FC<BusinessLogoProps> = ({
  url,
  name = 'Empresa',
  className = '',
  size = 'md',
  rounded = 'rounded-xl'
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error when url changes
  useEffect(() => {
    setHasError(false);
  }, [url]);

  const initials = (name || 'EM')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'EM';

  const sizeClasses: Record<string, string> = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl'
  };

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  // Se não tem URL ou falhou no carregamento, mostra o monograma com as iniciais do estabelecimento
  if (!url || hasError) {
    return (
      <div
        className={`${currentSizeClass} ${rounded} bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 text-white font-black flex items-center justify-center shrink-0 shadow-sm select-none ${className}`}
        title={name}
      >
        <span>{initials}</span>
      </div>
    );
  }

  // Tag <img> direta com a URL pública definitiva do Supabase
  // IMPORTANTE: NÃO usar crossOrigin="anonymous", pois gera bloqueio de CORS em navegadores mobile/anônimos
  return (
    <img
      src={url}
      alt={name}
      loading="eager"
      referrerPolicy="no-referrer"
      onError={() => {
        console.warn(`[BusinessLogo] Falha ao carregar logo para "${name}". URL: ${url}`);
        setHasError(true);
      }}
      className={`${currentSizeClass} ${rounded} object-contain shrink-0 bg-white/95 border border-slate-200/80 ${className}`}
    />
  );
};
