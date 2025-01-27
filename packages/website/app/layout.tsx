import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "./components/header";
import { PrivyClientProvider } from "./components/privy-provider";

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
  description: "IPFS pinning and management for BuidlGuidl",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`min-h-screen bg-[#0a0c10] text-white ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <PrivyClientProvider>
            <Header />
            <main className="mx-auto max-w-3xl p-4">{children}</main>
          </PrivyClientProvider>
        </Providers>
      </body>
    </html>
  );
}
