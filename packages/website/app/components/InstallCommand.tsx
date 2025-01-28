"use client";

export const InstallCommand = ({ command }: { command: string }) => {
  return (
    <div className="m-2 bg-gray-950 rounded-lg p-4 font-mono text-sm relative group">
      <code className="text-gray-300">{command}</code>
      <button
        onClick={() => navigator.clipboard.writeText(command)}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity
                    px-2 py-1 text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 rounded"
      >
        Copy
      </button>
    </div>
  );
};
