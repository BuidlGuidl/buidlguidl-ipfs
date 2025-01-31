import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import type { User, ApiKey, IpfsCluster } from "@prisma/client";

export interface SerializedUser
  extends Omit<User, "size" | "sizeLimit" | "createdAt" | "updatedAt"> {
  size: string;
  sizeLimit: string;
  createdAt: string;
  updatedAt: string;
  apiKeys: SerializedApiKey[];
  clusters: SerializedUserCluster[];
}

interface SerializedApiKey
  extends Omit<ApiKey, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ipfsCluster: SerializedIpfsCluster;
}

interface SerializedUserCluster {
  userId: string;
  clusterId: string;
  createdAt: string;
  updatedAt: string;
  ipfsCluster: SerializedIpfsCluster;
}

interface SerializedIpfsCluster
  extends Omit<IpfsCluster, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

interface CreateApiKeyParams {
  name: string;
  ipfsClusterId?: string;
}

export function useUser() {
  const { authenticated, getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch("/api/user", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch user data");
      return response.json() as Promise<SerializedUser>;
    },
    enabled: !!authenticated,
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
    mutationFn: async (params: CreateApiKeyParams) => {
      const token = await getAccessToken();
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error("Failed to create API key");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
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
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}
