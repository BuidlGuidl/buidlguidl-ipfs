"use client";

import { InstallCommand } from "./components/install-command";
import { LoginButton } from "./components/login-button";
import { DocsLink } from "./components/docs-link";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <div>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <main className="flex flex-col items-center sm:items-start space-y-10">
            <div className="space-y-6">
              <h1 className="text-xl font-semibold font-[family-name:var(--font-geist-mono)]">
                A toolkit for uploading to decentralised storage
              </h1>

              <div className="space-y-8">
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <h2 className="text-base font-semibold font-[family-name:var(--font-geist-mono)]">
                      ipfs-uploader
                    </h2>
                    <DocsLink href="https://github.com/buidlguidl/buidlguidl-ipfs/tree/main/packages/ipfs-uploader" />
                  </div>
                  <p className="text-gray-400 mb-3">
                    A simple typescript library for uploading data in varying
                    formats to multiple different data providers
                  </p>
                  <InstallCommand command="pnpm add ipfs-uploader" />
                </div>

                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <h2 className="text-base font-semibold font-[family-name:var(--font-geist-mono)]">
                      bgipfs
                    </h2>
                    <DocsLink href="https://github.com/buidlguidl/buidlguidl-ipfs/tree/main/packages/bgipfs" />
                  </div>
                  <p className="text-gray-400 mb-3">
                    A CLI for running IPFS clusters and uploading to IPFS
                  </p>
                  <p className="text-sm text-gray-400 mb-2">
                    Install with curl:
                  </p>
                  <InstallCommand command="curl -fsSL https://bgipfs.com/cli/install.sh | sh" />
                  <p className="text-sm text-gray-400 mb-2">
                    Or with a package manager:
                  </p>
                  <InstallCommand command="pnpm add bgipfs" />
                </div>

                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <h2 className="text-base font-semibold font-[family-name:var(--font-geist-mono)]">
                      bgipfs.com
                    </h2>
                    <DocsLink href="https://github.com/buidlguidl/buidlguidl-ipfs/tree/main/packages/website" />
                  </div>
                  <p className="text-gray-400 mb-3">
                    A simple IPFS pinning service to help developers get started
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 items-center">
              <Link
                className="rounded-lg px-6 py-2 bg-black dark:bg-white text-white dark:text-black font-semibold 
                           transition-all hover:scale-105 hover:shadow-lg"
                href="/upload"
              >
                Try a demo
              </Link>
              <span className="text-gray-400">or</span>
              <LoginButton
                className="rounded-lg px-6 py-2 border border-white/20 font-semibold 
                           transition-all hover:scale-105 hover:shadow-lg hover:bg-white/5"
              />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
