"use client";

export const InstallCommand = () => {
  return (
    <div className="w-full max-w-2xl">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        Get started with bgipfs-cli:
      </p>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm relative group">
        <code>curl -fsSL https://bgipfs.com/bgipfs-cli/install.sh | sh</code>
        <button
          onClick={() =>
            navigator.clipboard.writeText(
              "curl -fsSL https://bgipfs.com/bgipfs-cli/install.sh | sh"
            )
          }
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity
                     px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded"
        >
          Copy
        </button>
      </div>
    </div>
  );
};
