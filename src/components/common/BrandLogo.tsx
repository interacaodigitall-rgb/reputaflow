import React, { useState } from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
}

export const BRAND_ICON_URL = '/assets/aistudio/FAVICON_8738add6.png';
export const BRAND_LOGO_URL = '/assets/aistudio/FAVICON_8738add6.png';

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'light'
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24'
  };

  if (imgError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-xs shrink-0 font-extrabold text-sm overflow-hidden ${className}`}
      >
        <span className="tracking-tight font-bold">
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">l</span>
          <span className="text-[#FBBC05]">o</span>
          <span className="text-[#34A853]">w</span>
        </span>
      </div>
    );
  }

  return (
    <img
      src={BRAND_ICON_URL}
      alt="GlowfyHub"
      onError={() => setImgError(true)}
      className={`${sizeClasses[size]} object-contain rounded-xl shrink-0 ${
        variant === 'dark' ? 'bg-white p-1 shadow-xs' : ''
      } ${className}`}
    />
  );
};

export const BrandWordmark: React.FC<{ className?: string; dark?: boolean }> = ({
  className = 'text-base'
}) => (
  <span className={`font-extrabold tracking-tight leading-none inline-flex items-center ${className}`}>
    <span className="text-[#4285F4]">G</span>
    <span className="text-[#4285F4]">l</span>
    <span className="text-[#EA4335]">o</span>
    <span className="text-[#FBBC05]">w</span>
    <span className="text-[#FBBC05]">f</span>
    <span className="text-[#EA4335]">y</span>
    <span className="text-[#34A853]">H</span>
    <span className="text-[#34A853]">u</span>
    <span className="text-[#34A853]">b</span>
  </span>
);
