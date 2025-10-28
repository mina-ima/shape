// api/unsplash-search.ts
// Vercel Serverless Function (Node.js)
export default async function handler(req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const orientation = searchParams.get("orientation") ?? "portrait";
    const perPage = Number(searchParams.get("per_page") ?? "20");
  
    // 優先：Vercelの環境変数。無ければクエリの key も許容（暫定）。
    const envKey = process.env.UNSPLASH_ACCESS_KEY;
    const key = envKey || searchParams.get("key") || "";
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing Unsplash key" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", q);
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("per_page", String(Math.min(Math.max(perPage, 1), 30)));
  
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Upstream error", detail: text }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
    const data = await res.json();
    // 返すフィールドを最小化（CSP方針とデータ極小化）
    const slim = Array.isArray(data?.results)
      ? data.results.map((r: any) => ({
          id: r.id,
          thumb: r.urls?.thumb,
          small: r.urls?.small,
          regular: r.urls?.regular,
          alt: r.alt_description ?? "",
          color: r.color ?? null,
          user: { name: r.user?.name ?? "", link: r.user?.links?.html ?? "" },
        }))
      : [];
    return new Response(JSON.stringify({ results: slim }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  