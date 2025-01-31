"use client";

import { usePrivy, User as PrivyUser } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from "@/app/hooks/use-user";
import type { SerializedUser } from "@/app/hooks/use-user";
import { formatBytes } from "@/app/lib/utils";

function truncateAddress(address: string, length = 6): string {
  if (!address) return "";
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

function UsageStats({ user }: { user: SerializedUser }) {
  const pinUsage = (user.pinCount / user.pinLimit) * 100;
  const storageUsage = (Number(user.size) / Number(user.sizeLimit)) * 100;

  return (
    <div className="space-y-6 bg-gray-900/50 border border-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-100">Usage</h2>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm text-gray-300 mb-2">
            <span>
              Pins ({user.pinCount} / {user.pinLimit})
            </span>
            <span>{pinUsage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full"
              style={{ width: `${Math.min(pinUsage, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm text-gray-300 mb-2">
            <span>
              Storage ({formatBytes(BigInt(user.size))} /{" "}
              {formatBytes(BigInt(user.sizeLimit))})
            </span>
            <span>{storageUsage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full"
              style={{ width: `${Math.min(storageUsage, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountInfo({ privyUser }: { privyUser: PrivyUser }) {
  return (
    <div className="space-y-6 bg-gray-900/50 border border-gray-800 rounded-lg p-6">
      <div className="space-y-4">
        {privyUser.email && (
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Email
            </label>
            <div className="mt-1 text-gray-100">{privyUser.email.address}</div>
          </div>
        )}

        {privyUser.wallet && (
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Wallet
            </label>
            <div className="mt-1 text-sm text-gray-100 font-mono">
              {truncateAddress(privyUser.wallet.address)}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300">
            User ID
          </label>
          <div className="mt-1 text-sm text-gray-100 font-mono">
            {truncateAddress(privyUser.id, 8)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { ready, authenticated, user: privyUser } = usePrivy();
  const router = useRouter();
  const { data: user, isLoading } = useUser();

  // Auth protection
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated || isLoading || !user) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-mono text-white">Account</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {privyUser && <AccountInfo privyUser={privyUser} />}
        <UsageStats user={user} />
      </div>
    </div>
  );
}
