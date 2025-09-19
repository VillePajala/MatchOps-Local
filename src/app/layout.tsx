import type { Metadata, Viewport } from "next";
import { Rajdhani } from 'next/font/google';
import "./globals.css";
import ClientWrapper from "@/components/ClientWrapper";
import QueryProvider from './QueryProvider';
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import InstallPrompt from "@/components/InstallPrompt";
import I18nInitializer from "@/components/I18nInitializer";
import { Analytics } from "@vercel/analytics/react";
import { manifestConfig } from "@/config/manifest.config.js";

// Configure Rajdhani font
const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '600'], // We'll use 600 for Semi-bold
  variable: '--font-rajdhani',
});

// Determine the current branch
const branch = process.env.VERCEL_GIT_COMMIT_REF || 'development';
const config = manifestConfig[branch] || manifestConfig.default;

export const metadata: Metadata = {
  title: config.appName,
  description: "MatchOps Local - Comprehensive coaching assistant for match day management, tactics, and player analysis",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: config.themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={rajdhani.variable}>
        <I18nInitializer>
          <ServiceWorkerRegistration />
          <InstallPrompt />
          <QueryProvider>
            <ClientWrapper>{children}</ClientWrapper>
          </QueryProvider>
        </I18nInitializer>
        {/* Only load Analytics in production or when explicitly enabled */}
        {(process.env.NODE_ENV === 'production' ||
          process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true') && <Analytics />}
      </body>
    </html>
  );}
