'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/app/rtk-base/hooks';
import {
  closeGlobalModal,
  setModalLoading,
} from '@/app/rtk-base/slices/globalModalSlice';
import { handleLogout } from '@/app/rtk-base/slices/authSlice';
import { PlusIcon } from '../../../../icons';
import toast from 'react-hot-toast';

/**
 * A reusable, centralized modal component controlled via Redux.
 * Enhanced with accessibility attributes and keyboard support.
 */
const GlobalModal = () => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const {
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    isLoading,
    actionType,
  } = useAppSelector((state) => state.globalModal);

  // Keyboard support: Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        dispatch(closeGlobalModal());
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, dispatch]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isLoading) return;
    dispatch(closeGlobalModal());
  };

  const handleConfirm = async () => {
    // ── Action: LOGOUT_USER ──────────────────────────────────────────────────
    if (actionType === 'LOGOUT_USER') {
      dispatch(setModalLoading(true));

      const res = await dispatch(handleLogout());

      dispatch(setModalLoading(false));

      if (res.meta.requestStatus === 'fulfilled') {
        toast.success('Logged out successfully');
        dispatch(closeGlobalModal());
        router.replace('/login');
      } else {
        // Even if the server call fails, the slice handles local cleanup
        toast.error('Logout failed, but local session cleared');
        dispatch(closeGlobalModal());
        router.replace('/login');
      }
      return;
    }

    // Future global actions can be handled here based on actionType
  };

  return (
    <div
      className='fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4 backdrop-blur-[1px]'
      onClick={handleClose}
      role='presentation'
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='modal-title'
        aria-describedby='modal-description'
        className='bg-white w-full max-w-sm border border-black/10 shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center justify-between p-4 border-b border-black/15 shrink-0 bg-gray-50/50'>
          <h2
            id='modal-title'
            className='text-[11px] font-bold tracking-[0.2em] uppercase text-black/60'
          >
            {title || 'Confirmation'}
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            aria-label='Close modal'
            className='w-6 h-6 flex items-center justify-center text-black/30 hover:text-black transition-colors cursor-pointer outline-none focus:text-black'
          >
            <PlusIcon size={16} className='rotate-45' aria-hidden='true' />
          </button>
        </div>

        {/* Content */}
        <div className='p-6 pb-8'>
          <p
            id='modal-description'
            className='text-sm text-black/70 leading-relaxed font-nunito'
          >
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className='flex border-t border-black/10 divide-x divide-black/10'>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className='flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase text-black/40 hover:text-black hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 cursor-pointer outline-none focus:bg-gray-50'
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
            className='flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase text-black hover:bg-black hover:text-white transition-all duration-200 disabled:opacity-50 cursor-pointer outline-none focus:ring-2 focus:ring-black focus:ring-inset'
          >
            {isLoading ? (
              <span
                className='flex items-center justify-center gap-1.5'
                aria-hidden='true'
              >
                <span className='w-1 h-1 bg-current rounded-full animate-bounce' />
                <span className='w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:0.2s]' />
                <span className='w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:0.4s]' />
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalModal;
