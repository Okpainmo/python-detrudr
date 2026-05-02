import React from 'react';

interface BrandHeaderAreaProps {
  title: string;
  subtitle: string;
}

export default function BrandHeaderArea({
  title,
  subtitle,
}: BrandHeaderAreaProps) {
  return (
    <div className='mb-8'>
      <div className='flex items-center gap-2 mb-6'>
        <div className='w-6 h-6 bg-black flex items-center justify-center'>
          <span className='text-white text-[10px] font-bold tracking-widest'>
            D
          </span>
        </div>
        <span className='text-sm font-semibold tracking-[0.2em] uppercase text-black'>
          Detrudr
        </span>
      </div>

      <h1 className='text-2xl font-semibold text-black tracking-tight leading-tight'>
        {title}
      </h1>
      <p className='mt-1.5 text-sm text-black/60 tracking-wide'>{subtitle}</p>
    </div>
  );
}
