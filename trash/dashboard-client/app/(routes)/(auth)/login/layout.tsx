import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className='min-h-screen bg-white flex items-center justify-center px-4 py-16'>
      <div
        className='fixed inset-0 pointer-events-none'
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className='relative w-full max-w-sm'>
        <div className='h-px w-full bg-black mb-8' />
        {children}
        <div className='h-px w-full bg-black/20 mt-8' />
      </div>
    </main>
  );
}
