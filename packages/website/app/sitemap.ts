import type { MetadataRoute } from "next";

const BASE_URL = "https://www.bgipfs.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/upload`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
