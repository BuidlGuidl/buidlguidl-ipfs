import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import type { Pin, IpfsCluster } from "@prisma/client";

// Extend the Pin type to handle string serialization of BigInt and Dates
interface SerializedPin extends Omit<Pin, 'size' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  size: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ipfsCluster: SerializedIpfsCluster;
}

interface SerializedIpfsCluster extends Omit<IpfsCluster, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

interface PaginatedPinsResponse {
  pins: SerializedPin[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export function usePins(page = 1, limit = 20) {
  const { getAccessToken } = usePrivy();

  return useQuery<PaginatedPinsResponse, Error>({
    queryKey: ["pins", page, limit],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/pins?page=${page}&limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch pins");
      return res.json();
    },
  });
}

export function useUpdatePin() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  
  return useMutation({
    mutationFn: async ({ cid, name }: { cid: string; name: string }) => {
      const token = await getAccessToken();
      const response = await fetch(`/api/pins/${cid}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Failed to update pin");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
    },
  });
}

export function useDeletePin() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  
  return useMutation({
    mutationFn: async (cid: string) => {
      const token = await getAccessToken();
      const response = await fetch(`/api/pins/${cid}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete pin");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
    },
  });
} 