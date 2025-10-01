import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getBackgroundImage } from "./search";
import { UnsplashSearchResult } from "./unsplash";

type SearchUnsplashFn = (
  query: string,
  apiKey: string,
) => Promise<UnsplashSearchResult[]>;

const mockUnsplash = vi.hoisted(() => ({
  searchUnsplash: vi.fn<SearchUnsplashFn>(),
}));

vi.mock("./unsplash", () => mockUnsplash);

describe("Background Image Search with Fallback", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should return Unsplash results if API call is successful", async () => {
    const mockUnsplashResults: UnsplashSearchResult[] = [
      {
        id: "1",
        thumbnailUrl: "http://unsplash.com/thumb1.jpg",
        attributions: {
          pageUrl: "http://unsplash.com/page1",
          photographer: "Photographer 1",
        },
      },
    ];
    mockUnsplash.searchUnsplash.mockResolvedValue(mockUnsplashResults);

    const results = await getBackgroundImage("test query", "test-api-key");

    expect(mockUnsplash.searchUnsplash).toHaveBeenCalledWith(
      "test query",
      "test-api-key",
    );
    expect(results).toEqual(mockUnsplashResults);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should fall back to local background if Unsplash API fails (404)", async () => {
    mockUnsplash.searchUnsplash.mockRejectedValue(
      new Error("Unsplash API request failed: Not Found"),
    );

    const results = await getBackgroundImage("test query", "test-api-key");

    expect(mockUnsplash.searchUnsplash).toHaveBeenCalledWith(
      "test query",
      "test-api-key",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch background images from Unsplash, falling back to local assets:",
      expect.any(Error),
    );
    expect(results).toEqual([
      {
        id: "fallback-0",
        thumbnailUrl: "/assets/fallback_bg/0.jpg",
        attributions: { pageUrl: "", photographer: "Local Fallback" },
      },
    ]);
  });

  it("should fall back to local background if Unsplash API fails (500)", async () => {
    mockUnsplash.searchUnsplash.mockRejectedValue(
      new Error("Unsplash API request failed: Internal Server Error"),
    );

    const results = await getBackgroundImage("test query", "test-api-key");

    expect(mockUnsplash.searchUnsplash).toHaveBeenCalledWith(
      "test query",
      "test-api-key",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch background images from Unsplash, falling back to local assets:",
      expect.any(Error),
    );
    expect(results).toEqual([
      {
        id: "fallback-0",
        thumbnailUrl: "/assets/fallback_bg/0.jpg",
        attributions: { pageUrl: "", photographer: "Local Fallback" },
      },
    ]);
  });

  it("should fall back to local background if Unsplash API fails (Rate Limit)", async () => {
    mockUnsplash.searchUnsplash.mockRejectedValue(
      new Error("Unsplash API request failed: Too Many Requests"),
    );

    const results = await getBackgroundImage("test query", "test-api-key");

    expect(mockUnsplash.searchUnsplash).toHaveBeenCalledWith(
      "test query",
      "test-api-key",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch background images from Unsplash, falling back to local assets:",
      expect.any(Error),
    );
    expect(results).toEqual([
      {
        id: "fallback-0",
        thumbnailUrl: "/assets/fallback_bg/0.jpg",
        attributions: { pageUrl: "", photographer: "Local Fallback" },
      },
    ]);
  });
});
