import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "StockTracker — Track Your Investments",
    template: "%s · StockTracker",
  },
  description: "Track stock investments with financial models, valuations, and thesis management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/*
          Browsers hide the `nonce` content attribute after parsing a script
          under an active CSP (it survives only on the `.nonce` DOM property),
          so React reads it back as "" during hydration and flags a benign
          mismatch against the real nonce. suppress it here — the property is
          already correct on the client and CSP validation is unaffected.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('click',function(e){var a=e.target.closest('.prose a[href]');if(a){a.target='_blank';a.rel='noopener noreferrer'}})`,
          }}
        />
      </body>
    </html>
  );
}
