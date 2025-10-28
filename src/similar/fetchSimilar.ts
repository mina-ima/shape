// src/similar/fetchSimilar.ts
/* 似た画像を同一オリジンの API プロキシ経由で取得する
   - 入力: キーワード配列（例: ["cat", "animal", "portrait"]）
   - 出力: HTMLImageElement（decode 済み）
*/

export type UnsplashResult = {
  image: HTMLImageElement;
  url: string;
  author?: string;
};

function buildQuery(keywords: string[]): string {
  const q = Array.from(new Set(keywords.filter(Boolean).map((s) => s.trim())))
    .join(" ")
    .replace(/\bOR\b/gi, " ")
    .replace(/[+|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// 第一引数 apiKey はサーバ側の環境変数を使う場合は未使用。
// ただし、暫定デバッグ用にヘッダーで転送できるよう保持。
export async function fetchSimilarFromUnsplash(
  apiKeyMaybe: string | null,
  keywords: string[],
  opts?: { orientation?: "portrait" | "landscape" | "squarish" }
): Promise<UnsplashResult> {
  const q = buildQuery(keywords);
  const orientation = opts?.orientation ?? "portrait";

  const headers: Record<string, string> = {};
  if (apiKeyMaybe) headers["x-unsplash-key"] = apiKeyMaybe;

  // ★ 同一オリジンのプロキシを叩く（CSP: connect-src 'self' を満たす）
  const res = await fetch(
    `/api/unsplash?q=${encodeURIComponent(q)}&orientation=${orientation}&per_page=20`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unsplash proxy failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const results = Array.isArray(json.results) ? json.results : [];
  if (!results.length) throw new Error("No similar image found");

  // 縦長 + 被写体大きめを優先
  results.sort((a: any, b: any) => {
    const score = (r: any) => (r.likes ?? 0) + 100 * ((r.height ?? 1) / Math.max(1, r.width ?? 1));
    return score(b) - score(a);
  });

  const pick = results[0];
  const rawUrl = pick?.urls?.regular || pick?.urls?.small || pick?.urls?.thumb;
  if (!rawUrl) throw new Error("No image URL in Unsplash result");

  try {
    const image = await loadImage(rawUrl);
    return { image, url: pick?.links?.html || rawUrl, author: pick?.user?.name };
  } catch {
    // 画像側のCSPが厳しい場合の保険（必要時のみ）
    const proxied = `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`;
    const image = await loadImage(proxied);
    return { image, url: pick?.links?.html || rawUrl, author: pick?.user?.name };
  }
}
