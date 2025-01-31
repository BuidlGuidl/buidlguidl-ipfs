"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useState } from "react";
import { LoginButton } from "./login-button";

function WalletAddress() {
  const { user, logout } = usePrivy();

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <Link href={`/account`} className="font-mono text-gray-200">
          {user?.email?.address ||
            user?.wallet?.address?.slice(0, 6) +
              "..." +
              user?.wallet?.address?.slice(-4)}
        </Link>
      </div>
      <button
        onClick={async () => {
          await logout();
        }}
        className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800"
      >
        Sign Out
      </button>
    </div>
  );
}

export function Header() {
  const { authenticated } = usePrivy();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navigationLinks = [
    { href: "/upload", label: "Upload" },
    { href: "/pins", label: "Pins" },
    { href: "/api-keys", label: "Keys" },
    { href: "/clusters", label: "Clusters" },
  ];

  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold">
            BuidlGuidl IPFS
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden rounded-md p-2 text-gray-400 hover:bg-gray-800"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {isMenuOpen ? (
              <path d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Desktop navigation */}

        <div className="hidden md:flex items-center gap-4">
          {authenticated ? (
            <>
              {navigationLinks.map((link) => (
                <Link key={link.href} href={link.href} className="text-sm">
                  {link.label}
                </Link>
              ))}
              <WalletAddress />
            </>
          ) : (
            <LoginButton
              className="rounded-lg px-4 py-2 text-sm border border-white/20
                        transition-all hover:scale-105 hover:shadow-lg hover:bg-white/5"
            />
          )}
        </div>
      </div>

      {/* Mobile navigation */}
      <div
        className={`${
          isMenuOpen ? "block" : "hidden"
        } md:hidden border-t border-white/10`}
      >
        <div className="space-y-2 px-4 py-3">
          <div className="py-2">
            {authenticated ? (
              <>
                {navigationLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block text-sm text-gray-400 hover:text-gray-200 py-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <WalletAddress />
              </>
            ) : (
              <LoginButton
                className="w-full rounded-lg px-4 py-2 text-sm border border-white/20
                          transition-all hover:scale-105 hover:shadow-lg hover:bg-white/5"
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
