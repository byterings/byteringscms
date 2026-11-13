import type { NextConfig } from 'next';

// API requests go through the runtime proxy in src/app/api/[...path]/route.ts,
// which reads API_URL at runtime (not at build time).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Container builds set NEXT_OUTPUT=standalone for a minimal runtime image.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
