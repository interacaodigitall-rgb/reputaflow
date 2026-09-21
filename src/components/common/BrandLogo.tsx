import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'light'
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  if (imgError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-sm shrink-0 ${className}`}
      >
        <Star className={`${iconSizes[size]} fill-white text-white`} />
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="ReputaFlow"
      onError={() => setImgError(true)}
      className={`${sizeClasses[size]} object-contain rounded-xl shrink-0 ${className}`}
    />
  );
};
