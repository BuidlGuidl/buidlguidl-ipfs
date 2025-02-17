import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "./components/header";
import { PrivyClientProvider } from "./components/privy-provider";
import { Footer } from "./components/footer";
import { AlphaBanner } from "./components/alpha-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuidlGuidl IPFS",
  description: "IPFS pinning service for BuidlGuidl",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          defer
          data-domain="bgipfs.com"
          src="https://plausible.io/js/script.js"
        ></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#0a0c10] text-gray-100 antialiased bg-gradient-to-b from-gray-900 to-gray-800`}
      >
        <Providers>
          <PrivyClientProvider>
            <AlphaBanner />
            <Header />
            <main className="mx-auto max-w-3xl p-4">{children}</main>
            <Footer />
          </PrivyClientProvider>
        </Providers>
      </body>
    </html>
  );
}
