// src/similar/fetchSimilar.ts
/* 似た画像を Unsplash から取ってくる簡易モジュール
   - 入力: キーワード配列（例: ["cat", "animal", "portrait"]）
   - 出力: HTMLImageElement（CORS可, decode済）
   - 失敗時: throw
*/

export type UnsplashResult = {
    image: HTMLImageElement;
    url: string;
    author?: string;
  };
  
  function buildQuery(keywords: string[]): string {
    const q = Array.from(new Set(keywords.filter(Boolean).map((s) => s.trim()))).join(" ");
    return q || "animal portrait";
  }
  
  function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // CORS 回避（Unsplash は許可されている）
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
  
  export async function fetchSimilarFromUnsplash(
    apiKey: string,
    keywords: string[],
    opts?: { orientation?: "portrait" | "landscape" | "squarish" }
  ): Promise<UnsplashResult> {
    const q = buildQuery(keywords);
    const orientation = opts?.orientation ?? "portrait";
    const endpoint = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      q
    )}&per_page=20&orientation=${orientation}&client_id=${encodeURIComponent(apiKey)}`;
  
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Unsplash search failed: ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json.results) ? json.results : [];
    if (!results.length) throw new Error("No similar image found");
  
    // 縦長かつ顔/被写体が大きそうなものを優先（単純に likes と width/height 比でソート）
    results.sort((a: any, b: any) => {
      const score = (r: any) => (r.likes ?? 0) + 100 * ((r.height ?? 1) / Math.max(1, r.width ?? 1));
      return score(b) - score(a);
    });
    const pick = results[0];
  
    const url =
      pick?.urls?.regular ||
      pick?.urls?.small ||
      pick?.urls?.full ||
      pick?.urls?.raw;
  
    if (!url) throw new Error("No image URL in Unsplash result");
  
    const image = await loadImage(url);
    return {
      image,
      url: pick?.links?.html || url,
      author: pick?.user?.name,
    };
  }
  