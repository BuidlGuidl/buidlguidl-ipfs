export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <h1 className="text-4xl font-bold">BuidlGuidl IPFS</h1>
        <ol className="list-inside list-decimal text-sm text-left font-[family-name:var(--font-geist-mono)]">
          <li className="mb-4">
            <a href="https://github.com/azf20/buidlguidl-ipfs/tree/main/packages/bgipfs-cli">
              bgipfs-cli: run an ipfs cluster
            </a>
          </li>
          <li className="mb-4">
            <a href="https://github.com/azf20/buidlguidl-ipfs/tree/main/packages/ipfs-uploader">
              ipfs-uploader: library for easy addition of multiple content types
            </a>
          </li>
          <li className="mb-4">
            <a href="https://github.com/azf20/buidlguidl-ipfs/tree/main/packages/nextjs">
              nextjs: this app
            </a>
          </li>
          <li className="mb-4">
            <a href="https://gateway.bgipfs.com/ipfs/bafkreibmcwvxstzb2x3cdcx7oqf65v2abgjikq5ja725mr6xdhe5zyf7cm">
              gateway.bgipfs.com: buidlguidl ipfs gateway
            </a>
          </li>
        </ol>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            href="/pin"
          >
            Pin Content
          </a>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44"
            href="https://github.com/azf20/buidlguidl-ipfs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Github
          </a>
        </div>
      </main>
    </div>
  );
}
