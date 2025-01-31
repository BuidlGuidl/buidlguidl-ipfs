"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  useUser,
  useCreateApiKey,
  useDeleteApiKey,
} from "@/app/hooks/use-user";

export default function ApiKeysPage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState<
    string | undefined
  >(process.env.NEXT_PUBLIC_DEFAULT_CLUSTER_ID ?? "default");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);

  const { data: user, isLoading } = useUser();
  const keys = user?.apiKeys ?? [];
  const clusters = user?.clusters.map((uc) => uc.ipfsCluster) ?? [];
  const createKey = useCreateApiKey();
  const deleteKey = useDeleteApiKey();

  // Auth protection
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await createKey.mutateAsync({
        name: newKeyName,
        ipfsClusterId: selectedClusterId,
      });
      setShowNewKey(result.apiKey);
      setNewKeyName("");
      setSelectedClusterId("default");
    } catch (error) {
      console.error("Failed to create API key:", error);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!window.confirm("Are you sure you want to delete this API key?")) {
      return;
    }

    try {
      await deleteKey.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete API key:", error);
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!ready || !authenticated || isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-mono text-white">Keys</h1>

      {(!keys || keys.length < 5) && (
        <form onSubmit={handleCreateKey} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-300"
            >
              New API Key Name
            </label>
            <div className="mt-1 flex gap-4">
              <input
                type="text"
                name="name"
                id="name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="block w-full rounded-md border-gray-700 bg-gray-900 text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                placeholder="Enter key name"
              />
              {clusters && clusters.length > 1 && (
                <select
                  value={selectedClusterId}
                  onChange={(e) => setSelectedClusterId(e.target.value)}
                  className="block rounded-md border-gray-700 bg-gray-900 text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                >
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={createKey.isPending || !newKeyName}
                className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </form>
      )}

      {keys && keys.length >= 5 && (
        <div className="rounded-md bg-yellow-900/50 border border-yellow-700/50 p-4">
          <div className="text-sm text-yellow-200">
            You have reached the maximum number of API keys (5).
          </div>
        </div>
      )}

      {showNewKey && (
        <div className="rounded-md bg-green-900/50 border border-green-700/50 p-4">
          <div className="flex">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-green-200">
                API Key Created
              </h3>
              <div className="mt-2 text-sm text-green-200">
                <p className="font-mono">{showNewKey}</p>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowNewKey(null)}
                  className="text-sm text-green-200 underline hover:text-green-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        {isLoading ? (
          <div className="p-4 text-gray-300">Loading API keys...</div>
        ) : keys?.length === 0 ? (
          <div className="p-4">
            <div className="text-sm text-gray-400">No API keys found</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {keys?.map((key) => (
              <div key={key.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-200">{key.name}</div>
                    <div className="mt-1 space-y-1">
                      <div className="text-sm text-gray-400">
                        Created on {formatDate(key.createdAt)}
                      </div>
                      <div className="text-sm font-mono text-gray-300 break-words overflow-anywhere">
                        {key.apiKey}
                      </div>
                      <div className="inline-flex items-center rounded-full bg-blue-900/50 px-2 py-1 text-xs font-medium text-blue-200">
                        {key.ipfsCluster.name}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="ml-4 rounded border border-red-800 px-3 py-1 text-sm text-red-200 hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 