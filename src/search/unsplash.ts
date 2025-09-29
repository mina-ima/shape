interface UnsplashApiResult {
  id: string;
  urls: {
    thumb: string;
  };
  links: {
    html: string;
  };
  user: {
    name: string;
  };
}

export interface UnsplashSearchResult {
  id: string;
  thumbnailUrl: string;
  attributions: {
    pageUrl: string;
    photographer: string;
  };
}

export async function searchUnsplash(
  query: string,
  apiKey: string,
): Promise<UnsplashSearchResult[]> {
  const response = await fetch(
    `https://api.unsplash.com/search/photos?query=${query}&per_page=32&client_id=${apiKey}`,
  );

  if (!response.ok) {
    throw new Error(`Unsplash API request failed: ${response.statusText}`);
  }

  const data = await response.json();

  return data.results.map((result: UnsplashApiResult) => ({
    id: result.id,
    thumbnailUrl: result.urls.thumb,
    attributions: {
      pageUrl: result.links.html,
      photographer: result.user.name,
    },
  }));
}
