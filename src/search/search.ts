import { searchUnsplash, UnsplashSearchResult } from "./unsplash";

export async function getBackgroundImage(
  query: string,
  apiKey: string,
): Promise<UnsplashSearchResult[]> {
  try {
    const unsplashResults = await searchUnsplash(query, apiKey);
    return unsplashResults;
  } catch (error) {
    console.error(
      "Failed to fetch background images from Unsplash, falling back to local assets:",
      error,
    );
    return getFallbackBackground();
  }
}

function getFallbackBackground(): UnsplashSearchResult[] {
  // In a real application, you would dynamically load images from the fallback_bg directory.
  // For now, we'll return a hardcoded fallback.
  return [
    {
      id: "fallback-0",
      thumbnailUrl: "/assets/fallback_bg/0.jpg",
      attributions: { pageUrl: "", photographer: "Local Fallback" },
    },
  ];
}
