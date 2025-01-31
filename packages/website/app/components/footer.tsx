import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto max-w-3xl p-4 text-sm text-gray-400">
      <div className="flex justify-center space-x-4">
        <Link
          href="https://github.com/buidlguidl/buidlguidl-ipfs"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-100 transition-colors"
        >
          GitHub
        </Link>
        <Link
          href={process.env.NEXT_PUBLIC_SUPPORT_URL || ""}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-100 transition-colors"
        >
          Support
        </Link>
      </div>
    </footer>
  );
}
