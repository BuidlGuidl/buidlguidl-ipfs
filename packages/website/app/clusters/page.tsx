"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from "@/app/hooks/use-user";

export default function ClustersPage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  const { data: user, isLoading } = useUser();
  const clusters = user?.clusters.map((uc) => uc.ipfsCluster) ?? [];

  // Auth protection
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-mono text-white">Clusters</h1>

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        {isLoading ? (
          <div className="p-4 text-gray-300">Loading clusters...</div>
        ) : clusters?.length === 0 ? (
          <div className="p-4">
            <div className="text-sm text-gray-400">No clusters found</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {clusters?.map((cluster) => (
              <div key={cluster.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-200">
                      {cluster.name}
                    </div>
                    <div className="mt-1 text-sm text-gray-400">
                      Gateway: {cluster.gatewayUrl}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 