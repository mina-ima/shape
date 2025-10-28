// /api/proxy-image.ts
// 役割: 画像URLを同一オリジン経由で配信して CSP の img-src 制約も回避（将来用）
// 使い方: GET /api/proxy-image?url=<encodedURL>

export default async function handler(req: any, res: any) {
    try {
      const { url } = req.query || {};
      if (!url || typeof url !== 'string') {
        res.status(400).send('missing url');
        return;
      }
  
      const upstream = await fetch(url);
      if (!upstream.ok) {
        res.status(upstream.status).send('upstream error');
        return;
      }
  
      // コンテンツタイプを透過
      const ct = upstream.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=300');
  
      // ストリーミング転送
      const arrayBuffer = await upstream.arrayBuffer();
      res.status(200).send(Buffer.from(arrayBuffer));
    } catch (e: any) {
      res.status(500).send(String(e?.message || e));
    }
  }
  