// /api/unsplash.ts
// 役割: フロントから同一オリジンで呼べる Unsplash 検索プロキシ
//      -> CSP の connect-src 'self' 制約を回避
// 使い方: GET /api/unsplash?q=cat+animal+portrait&orientation=portrait&per_page=20
// 環境: Vercel Serverless / Edge どちらでもOK（Node fetch）

export default async function handler(req: any, res: any) {
    try {
      const { q = '', orientation = 'portrait', per_page = '20' } = req.query || {};
      const apiKey =
        process.env.UNSPLASH_ACCESS_KEY ||
        req.headers['x-unsplash-key'] ||
        req.headers['x-api-key'];
  
      if (!apiKey) {
        res.status(400).json({ error: 'UNSPLASH_ACCESS_KEY not set' });
        return;
      }
  
      const endpoint = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        String(q)
      )}&per_page=${encodeURIComponent(String(per_page))}&orientation=${encodeURIComponent(
        String(orientation)
      )}&client_id=${encodeURIComponent(String(apiKey))}`;
  
      const upstream = await fetch(endpoint);
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Unsplash: ${upstream.status}` });
        return;
      }
      const json = await upstream.json();
  
      // CORS は同一オリジン前提で不要だが、念のため許可
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(json));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
  