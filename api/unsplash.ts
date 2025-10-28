// /api/unsplash.ts
// 目的: フロントから同一オリジンで Unsplash 検索できるようにする（CSP: connect-src 'self' 対応）
// キー取得: 環境変数 UNSPLASH_ACCESS_KEY を最優先。
//           次点でリクエストヘッダー 'x-unsplash-key'、さらに ?key=... も暫定で許可（デバッグ用）。
// 応答: { results: Array<{ id, urls:{thumb,small,regular}, alt, likes, width, height, user, links }> }

export default async function handler(req: any, res: any) {
  try {
    const qRaw = String(req.query?.q ?? "");
    const orientation = String(req.query?.orientation ?? "portrait");
    const perPage = Math.min(Math.max(Number(req.query?.per_page ?? 20), 1), 30);

    // ---- キーの受け取りルート（優先順）----
    const envKey = process.env.UNSPLASH_ACCESS_KEY;
    const headerKey =
      (req.headers?.["x-unsplash-key"] as string | undefined) ||
      (req.headers?.["x-api-key"] as string | undefined);
    const queryKey = (req.query?.key as string | undefined) || undefined;

    const key = envKey || headerKey || queryKey;
    if (!key) {
      // 400 だとフロントが一般エラーとしか見えないので 401 で明示
      res.status(401).json({ error: "Unsplash key is missing. Set env UNSPLASH_ACCESS_KEY or send x-unsplash-key header." });
      return;
    }

    // ---- 検索語の正規化（"OR" 等の論理語は削除して単語空白区切りへ）----
    const q = qRaw
      .replace(/\bOR\b/gi, " ")
      .replace(/[+|]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "animal portrait";

    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", q);
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("per_page", String(perPage));

    const upstream = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` },
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: "Unsplash upstream error", detail });
      return;
    }

    const json = await upstream.json();
    const results = Array.isArray(json?.results)
      ? json.results.map((r: any) => ({
          id: r.id,
          urls: { thumb: r.urls?.thumb, small: r.urls?.small, regular: r.urls?.regular },
          alt: r.alt_description ?? "",
          likes: r.likes ?? 0,
          width: r.width ?? 0,
          height: r.height ?? 0,
          user: { name: r.user?.name ?? "", link: r.user?.links?.html ?? "" },
          links: { html: r.links?.html ?? "" },
        }))
      : [];

    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({ results }));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
