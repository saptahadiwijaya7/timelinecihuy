import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from './pwa-register';

export const metadata: Metadata = {
  title: 'Timeline Project',
  description: 'Manajemen timeline project tim multimedia',
  applicationName: 'Timeline',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/img/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Timeline',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
