"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { privyConfig } from "@/app/lib/privy";

export function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  return <PrivyProvider {...privyConfig}>{children}</PrivyProvider>;
} 