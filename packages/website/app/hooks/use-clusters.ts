import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import type { IpfsCluster } from "@prisma/client";

export function useClusters() {
  const { getAccessToken } = usePrivy();
  
  return useQuery({
    queryKey: ["clusters"],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch("/api/clusters", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch clusters");
      return response.json() as Promise<IpfsCluster[]>;
    },
  });
}

export function useCreateCluster() {
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();
  
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const token = await getAccessToken();
      const response = await fetch("/api/clusters", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create cluster");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
    },
  });
} 