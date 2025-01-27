"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useState } from "react";

function UserMenu() {
  const { user, logout } = usePrivy();

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <div className="font-mono text-gray-200">
          {user?.email?.toString() ||
            user?.wallet?.address?.slice(0, 6) +
              "..." +
              user?.wallet?.address?.slice(-4)}
        </div>
        {user?.wallet?.address && (
          <div className="text-xs text-gray-400">
            {user.wallet.address.slice(0, 6)}...{user.wallet.address.slice(-4)}
          </div>
        )}
      </div>
      <button
        onClick={logout}
        className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800"
      >
        Sign Out
      </button>
    </div>
  );
}

function LoginButton() {
  const { ready, authenticated, login } = usePrivy();
  const disableLogin = !ready || (ready && authenticated);

  return (
    <button
      disabled={disableLogin}
      onClick={login}
      className="rounded bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
    >
      {ready ? "Log in" : "Loading..."}
    </button>
  );
}

export function Header() {
  const { authenticated } = usePrivy();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="border-b bg-[#0a0c10]">
      <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link href="/" className="font-mono text-white">
          BuidlGuidl IPFS
        </Link>

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

        {/* Desktop menu */}
        <div className="hidden md:flex items-center gap-4">
          {authenticated && (
            <nav className="flex items-center gap-4">
              <Link
                href="/pins"
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Pins
              </Link>
              <Link
                href="/api-keys"
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Keys
              </Link>
              <Link
                href="/clusters"
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Clusters
              </Link>
            </nav>
          )}
          {authenticated ? <UserMenu /> : <LoginButton />}
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`${isMenuOpen ? "block" : "hidden"} md:hidden border-t border-gray-800`}
      >
        <div className="space-y-2 px-4 py-3">
          {authenticated && (
            <>
              <Link
                href="/pins"
                className="block text-sm text-gray-400 hover:text-gray-200 py-2"
              >
                Pins
              </Link>
              <Link
                href="/api-keys"
                className="block text-sm text-gray-400 hover:text-gray-200 py-2"
              >
                Keys
              </Link>
              <Link
                href="/clusters"
                className="block text-sm text-gray-400 hover:text-gray-200 py-2"
              >
                Clusters
              </Link>
            </>
          )}
          <div className="py-2">
            {authenticated ? <UserMenu /> : <LoginButton />}
          </div>
        </div>
      </div>
    </header>
  );
}
