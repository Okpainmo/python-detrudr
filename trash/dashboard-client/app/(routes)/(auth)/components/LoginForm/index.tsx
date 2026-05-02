'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/app/rtk-base/hooks';
import { handleLogin, clearError } from '@/app/rtk-base/slices/authSlice';
import toast from 'react-hot-toast';
import { EyeIcon, EyeOffIcon } from '@/app/icons';

export default function LoginForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isLoading, isAuthenticated } = useAppSelector((state) => state.auth);

  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  // Handle redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  // Clear errors on unmount
  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const onHandleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { email, password } = formData;

    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    // Dispatch thunk
    const res = await dispatch(
      handleLogin({
        email,
        password,
      }),
    );

    // pattern for checking request successes before processing redirects
    if (res.meta.requestStatus === 'fulfilled') {
      toast.success('Signed in successfully!');
      router.push('/');
    } else if (res.meta.requestStatus === 'rejected') {
      toast.error(
        typeof res.payload === 'string' ? res.payload : 'Login failed',
      );
    }
  };

  return (
    <form onSubmit={onHandleSignIn} className='p-5 space-y-4' noValidate>
      {/* Email field */}
      <div>
        <label
          htmlFor='email'
          className='block text-[12px] font-semibold tracking-[0.15em] uppercase text-black/60 mb-2'
        >
          Email address
        </label>
        <div className='border border-black/25 focus-within:border-black transition-colors duration-150'>
          <input
            id='email'
            type='email'
            autoComplete='email'
            placeholder='you@example.com'
            value={formData.email}
            onChange={handleInputChange}
            disabled={isLoading}
            required
            aria-required='true'
            className='w-full px-3 py-2.5 text-sm text-black placeholder:text-black/35 bg-transparent outline-none font-mono'
          />
        </div>
      </div>

      {/* Password field */}
      <div>
        <div className='flex items-center justify-between mb-2'>
          <label
            htmlFor='password'
            className='block text-[12px] font-semibold tracking-[0.15em] uppercase text-black/60'
          >
            Password
          </label>
          <Link
            href='#'
            className='text-[12px] font-semibold tracking-widest uppercase text-black/50 hover:text-black transition-colors duration-150 underline underline-offset-2'
          >
            Forgot?
          </Link>
        </div>
        <div className='border border-black/25 focus-within:border-black transition-colors duration-150 flex items-center pr-3'>
          <input
            id='password'
            type={showPassword ? 'text' : 'password'}
            autoComplete='current-password'
            placeholder='••••••••••'
            value={formData.password}
            onChange={handleInputChange}
            disabled={isLoading}
            required
            aria-required='true'
            className='flex-1 px-3 py-2.5 text-sm text-black placeholder:text-black/35 bg-transparent outline-none font-mono'
          />
          <button
            type='button'
            onClick={() => setShowPassword(!showPassword)}
            className='text-black/30 hover:text-black transition-colors cursor-pointer outline-none focus:text-black'
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOffIcon size={16} aria-hidden='true' />
            ) : (
              <EyeIcon size={16} aria-hidden='true' />
            )}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className='border-t border-black/15 my-1' role='presentation' />

      {/* Submit */}
      <button
        type='submit'
        disabled={isLoading}
        aria-busy={isLoading}
        className={`w-full bg-black text-white text-sm font-semibold tracking-[0.15em] uppercase py-3 hover:bg-black/80 active:bg-black/90 transition-colors duration-150 cursor-pointer flex items-center justify-center ${
          isLoading ? 'opacity-70 cursor-not-allowed' : ''
        }`}
      >
        {isLoading ? 'Signing in...' : 'Sign in →'}
      </button>
    </form>
  );
}
