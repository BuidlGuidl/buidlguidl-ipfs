"use client";

import { createContext, useContext, useState, ReactNode } from 'react';

type PackageManager = 'npm' | 'yarn' | 'pnpm';

interface PackageManagerContextType {
  selectedPM: PackageManager;
  setSelectedPM: (pm: PackageManager) => void;
}

const PackageManagerContext = createContext<PackageManagerContextType | undefined>(undefined);

export function PackageManagerProvider({ children }: { children: ReactNode }) {
  const [selectedPM, setSelectedPM] = useState<PackageManager>('pnpm');

  return (
    <PackageManagerContext.Provider value={{ selectedPM, setSelectedPM }}>
      {children}
    </PackageManagerContext.Provider>
  );
}

export function usePackageManager() {
  const context = useContext(PackageManagerContext);
  if (context === undefined) {
    throw new Error('usePackageManager must be used within a PackageManagerProvider');
  }
  return context;
} 