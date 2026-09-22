import React, { useState } from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
}

export const BRAND_ICON_URL = 'https://i.postimg.cc/DfdcHHtT/LOGO-glowfy.png';
export const BRAND_LOGO_URL = 'https://i.postimg.cc/DfdcHHtT/LOGO-glowfy.png';

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'light'
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  };

  if (imgError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0 font-extrabold text-sm overflow-hidden ${className}`}
      >
        <img
          src="https://i.postimg.cc/2ScRmDwy/logo-02-png.png"
          alt="ReputaFlow"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <img
      src={BRAND_ICON_URL}
      alt="ReputaFlow"
      onError={() => setImgError(true)}
      referrerPolicy="no-referrer"
      className={`${sizeClasses[size]} object-contain rounded-xl shrink-0 ${className}`}
    />
  );
};

