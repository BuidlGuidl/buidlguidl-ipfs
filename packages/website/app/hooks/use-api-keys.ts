import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import type { ApiKey, IpfsCluster } from "@prisma/client";

interface SerializedApiKey extends Omit<ApiKey, 'createdAt' | 'updatedAt' | 'deletedAt'> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ipfsCluster: SerializedIpfsCluster;
}

interface SerializedIpfsCluster extends Omit<IpfsCluster, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

export function useApiKeys() {
  const { authenticated, getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["apiKeys"],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch("/api/api-keys", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch API keys");
      return response.json() as Promise<SerializedApiKey[]>;
    },
    enabled: !!authenticated,
    initialData: [] as SerializedApiKey[],
    // Don't show stale data while refetching
    staleTime: 0,
    // Refetch when window is focused
    refetchOnWindowFocus: true,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  
  return useMutation({
    mutationFn: async (name: string) => {
      const token = await getAccessToken();
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Failed to create API key");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getAccessToken();
      const response = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete API key");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
} 