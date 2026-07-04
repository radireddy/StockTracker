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
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('click',function(e){var a=e.target.closest('.prose a[href]');if(a){a.target='_blank';a.rel='noopener noreferrer'}})`,
          }}
        />
      </body>
    </html>
  );
}
