import type { Metadata } from 'next';
import { nunito_sans, poppins, lato } from './utils/fonts';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from '@/app/rtk-base/provider';
import GlobalModal from './(routes)/(dashboard-home)/components/GlobalModal';
import '@/app/styles/globals.css';

export const metadata: Metadata = {
  title: 'Detrudr(Web) Demo',
  description: 'Detrudr(Web) Demo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' className={`${nunito_sans} ${poppins} ${lato}`}>
      <body suppressHydrationWarning>
        <AppProvider>
          <GlobalModal />
          {children}
          <Toaster position='top-right' />
        </AppProvider>
      </body>
    </html>
  );
}
