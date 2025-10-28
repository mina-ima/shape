// src/similar/fetchSimilar.ts
/* 似た画像を同一オリジンの API プロキシ経由で取得
   - 入力: キーワード配列（例: ["cat", "animal", "portrait"]）
   - 出力: HTMLImageElement（decode済）
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
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function fetchSimilarFromUnsplash(
  _apiKeyIgnored: string, // 旧API互換（使わない）
  keywords: string[],
  opts?: { orientation?: "portrait" | "landscape" | "squarish" }
): Promise<UnsplashResult> {
  const q = buildQuery(keywords);
  const orientation = opts?.orientation ?? "portrait";

  // ★ 同一オリジンのプロキシを叩く（CSP: connect-src 'self' を満たす）
  const res = await fetch(`/api/unsplash?q=${encodeURIComponent(q)}&orientation=${orientation}&per_page=20`);
  if (!res.ok) throw new Error(`Unsplash proxy failed: ${res.status}`);
  const json = await res.json();
  const results = Array.isArray(json.results) ? json.results : [];
  if (!results.length) throw new Error("No similar image found");

  // 縦長/被写体大きめを優先
  results.sort((a: any, b: any) => {
    const score = (r: any) => (r.likes ?? 0) + 100 * ((r.height ?? 1) / Math.max(1, r.width ?? 1));
    return score(b) - score(a);
  });
  const pick = results[0];

  // 画像は **必要に応じて** 画像プロキシ経由（CSP の img-src が厳しい場合）
  const rawUrl =
    pick?.urls?.regular || pick?.urls?.small || pick?.urls?.full || pick?.urls?.raw;

  if (!rawUrl) throw new Error("No image URL in Unsplash result");

  // まずは直接ロード（img-src が許可されていればこれでOK）
  try {
    const image = await loadImage(rawUrl);
    return { image, url: pick?.links?.html || rawUrl, author: pick?.user?.name };
  } catch {
    // ダメなら同一オリジンで再試行（CSP回避）
    const proxied = `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`;
    const image = await loadImage(proxied);
    return { image, url: pick?.links?.html || rawUrl, author: pick?.user?.name };
  }
}
