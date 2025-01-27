"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePins, useUpdatePin, useDeletePin } from "@/app/hooks/use-pins";

export default function PinsPage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: pins, isLoading, refetch } = usePins();
  const updatePin = useUpdatePin();
  const deletePin = useDeletePin();

  // Auth protection
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  async function handleUpdateName(cid: string) {
    try {
      await updatePin.mutateAsync({ cid, name: editName });
      setEditingPin(null);
      setEditName("");
    } catch (error) {
      console.error('Failed to update pin:', error);
    }
  }

  async function handleDelete(cid: string) {
    if (!window.confirm('Are you sure you want to unpin this file?')) {
      return;
    }

    try {
      await deletePin.mutateAsync(cid);
    } catch (error) {
      console.error('Failed to delete pin:', error);
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatBytes(sizeStr: string) {
    const bytes = parseInt(sizeStr, 10);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  if (!ready || !authenticated) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono text-white">Pins</h1>
        <button
          onClick={() => refetch()}
          className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        {isLoading ? (
          <div className="p-4 text-gray-300">Loading pins...</div>
        ) : pins?.length === 0 ? (
          <div className="p-4">
            <div className="text-sm text-gray-400">No pins found</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {pins?.map((pin) => (
              <div key={`${pin.userId}-${pin.cid}`} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center">
                      {editingPin === pin.cid ? (
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleUpdateName(pin.cid);
                          }}
                          className="flex items-center gap-3"
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="block rounded-md border-gray-700 bg-gray-900 text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                            placeholder="Enter name"
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="text-sm text-blue-400 hover:text-blue-300 px-2 py-1"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPin(null);
                              setEditName("");
                            }}
                            className="text-sm text-gray-400 hover:text-gray-300 px-2 py-1"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <a 
                            href={`${pin.ipfsCluster.gatewayUrl}/ipfs/${pin.cid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-400 hover:text-blue-300 break-all pr-2"
                          >
                            {pin.name || pin.cid}
                          </a>
                          <button
                            onClick={() => {
                              setEditingPin(pin.cid);
                              setEditName(pin.name || "");
                            }}
                            className="text-gray-400 hover:text-gray-300"
                          >
                            Edit name
                          </button>
                        </>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      {pin.name && (
                        <div className="text-sm font-mono text-gray-400 break-all">
                          {pin.cid}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-400">
                          {formatBytes(pin.size)} • Pinned on {formatDate(pin.createdAt)}
                        </span>
                        <div className="inline-flex items-center rounded-full bg-blue-900/50 px-2 py-1 text-xs font-medium text-blue-200">
                          {pin.ipfsCluster.name}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(pin.cid)}
                    className="ml-4 rounded border border-red-800 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50"
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