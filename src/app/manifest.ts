import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Timeline Project',
    short_name: 'Timeline',
    description: 'Manajemen timeline project tim multimedia',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
