import { InstallCommand } from "./components/InstallCommand";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
        <main className="flex flex-col items-center sm:items-start space-y-10">
          {/* Header Section */}
          <div className="text-center sm:text-left space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400">
              BuidlGuidl IPFS
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium italic">
              Alpha software, under active development
            </p>
          </div>

          {/* Features List */}
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
                website: this website
              </a>
            </li>
            <li className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">
              <a
                href="https://gateway.bgipfs.com/ipfs/bafkreibmcwvxstzb2x3cdcx7oqf65v2abgjikq5ja725mr6xdhe5zyf7cm"
                className="hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                gateway.bgipfs.com: buidlguidl ipfs gateway
              </a>
            </li>
          </ol>

          <InstallCommand />

          {/* Action Buttons */}
          <div className="flex gap-6 items-center flex-col sm:flex-row pt-4">
            <Link
              className="rounded-lg px-8 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold 
                         transition-all hover:scale-105 hover:shadow-lg"
              href="/upload"
            >
              Upload
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
