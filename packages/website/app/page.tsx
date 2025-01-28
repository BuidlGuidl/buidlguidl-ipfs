import { InstallCommand } from "./components/InstallCommand";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <main className="flex flex-col items-center sm:items-start space-y-10">
          <ol className="list-decimal list-inside space-y-6 text-base sm:text-lg font-[family-name:var(--font-geist-mono)] pl-4">
            <li className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">
              <a
                href="https://github.com/azf20/buidlguidl-ipfs/tree/main/packages/bgipfs"
                className="hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                bgipfs: CLI for running an IPFS cluster and uploading to IPFS
              </a>
            </li>
            <li className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">
              <a
                href="https://github.com/azf20/buidlguidl-ipfs/tree/main/packages/ipfs-uploader"
                className="hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                ipfs-uploader: upload multiple data types to multiple IPFS
                providers
              </a>
            </li>
            <li className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">
              <a
                href="https://github.com/azf20/buidlguidl-ipfs/tree/main/packages/website"
                className="hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                BuidlGuidl IPFS: upload and pin files to the BuidlGuidl IPFS
                cluster
              </a>
            </li>
          </ol>
          <div className="w-full max-w-2xl">
            <p className="text-sm text-gray-400">
              Get started with bgipfs in one command:
            </p>
            <InstallCommand command="curl -fsSL https://bgipfs.com/cli/install.sh | sh" />
            <p className="text-sm text-gray-400">With a package manager:</p>
            <InstallCommand command="pnpm add bgipfs" />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-6 items-center flex-col sm:flex-row pt-4">
            <Link
              className="rounded-lg px-8 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold 
                         transition-all hover:scale-105 hover:shadow-lg"
              href="/upload"
            >
              Demo
            </Link>
            <a
              className="rounded-lg px-8 py-3 border border-gray-200 dark:border-gray-700 
                         hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold"
              href="https://github.com/azf20/buidlguidl-ipfs"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
