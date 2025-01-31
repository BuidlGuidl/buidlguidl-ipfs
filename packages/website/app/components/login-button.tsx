"use client";

import { usePrivy } from "@privy-io/react-auth";

export function LoginButton({ className }: { className?: string }) {
  const { login } = usePrivy();

  return (
    <button onClick={login} className={className}>
      Sign in
    </button>
  );
}
