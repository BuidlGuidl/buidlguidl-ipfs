"use client";

import { usePackageManager } from '../contexts/package-manager-context';

export const InstallCommand = ({ command }: { command: string }) => {
  const { selectedPM, setSelectedPM } = usePackageManager();

  const getCommand = () => {
    const baseCommand = command.replace('pnpm add', '').trim();
    switch (selectedPM) {
      case 'npm':
        return `npm install ${baseCommand}`;
      case 'yarn':
        return `yarn add ${baseCommand}`;
      default:
        return command;
    }
  };

  // Don't show package manager options for curl commands
  const showPMOptions = !command.includes('curl');

  return (
    <div className="m-2 bg-gray-950 rounded-lg p-4 font-mono text-sm relative group">
      {showPMOptions && (
        <div className="flex gap-2 mb-2">
          {(['pnpm', 'npm', 'yarn'] as const).map((pm) => (
            <button
              key={pm}
              onClick={() => setSelectedPM(pm)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                selectedPM === pm 
                  ? 'bg-gray-700 text-white' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {pm}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <code className="text-gray-300">{showPMOptions ? getCommand() : command}</code>
        <button
          onClick={() => navigator.clipboard.writeText(showPMOptions ? getCommand() : command)}
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity
                    px-2 py-1 text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 rounded"
        >
          Copy
        </button>
      </div>
    </div>
  );
};
