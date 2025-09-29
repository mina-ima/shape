import { describe, it, expect, vi } from "vitest";
import { searchUnsplash } from "./unsplash";

const fetch = vi.fn();
vi.stubGlobal("fetch", fetch);

describe("Unsplash API Client", () => {
  it("should fetch images from Unsplash API and return formatted results", async () => {
    const mockApiKey = "test-api-key";
    const mockQuery = "nature";
    const mockApiResponse = {
      results: [
        {
          id: "1",
          urls: { thumb: "https://example.com/thumb1.jpg" },
          links: { html: "https://unsplash.com/photos/1" },
          user: { name: "Photographer 1" },
        },
        {
          id: "2",
          urls: { thumb: "https://example.com/thumb2.jpg" },
          links: { html: "https://unsplash.com/photos/2" },
          user: { name: "Photographer 2" },
        },
      ],
    };

    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const results = await searchUnsplash(mockQuery, mockApiKey);

    expect(fetch).toHaveBeenCalledWith(
      `https://api.unsplash.com/search/photos?query=${mockQuery}&per_page=32&client_id=${mockApiKey}`,
    );

    expect(results).toEqual([
      {
        id: "1",
        thumbnailUrl: "https://example.com/thumb1.jpg",
        attributions: {
          pageUrl: "https://unsplash.com/photos/1",
          photographer: "Photographer 1",
        },
      },
      {
        id: "2",
        thumbnailUrl: "https://example.com/thumb2.jpg",
        attributions: {
          pageUrl: "https://unsplash.com/photos/2",
          photographer: "Photographer 2",
        },
      },
    ]);
  });
});
