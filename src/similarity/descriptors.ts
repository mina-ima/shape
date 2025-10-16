import getCV from "@/lib/cv";

/**
 * OpenCV Hu Moments（モック実装に合わせて 7 要素を返す）
 */
export function calculateHuMoments(contour: any): number[] {
  const cv = getCV(); // ← 必ず getCV() を呼ぶ
  const moments = cv.moments(contour);
  const hu = new cv.Mat();
  cv.HuMoments(moments, hu);

  const out: number[] = [];
  for (let i = 0; i < hu.rows; i++) out.push(hu.data64F[i]);
  hu.delete?.();
  return out;
}

/**
 * 簡易 EFD（Elliptic Fourier Descriptors）
 * モック目的：輪郭座標配列（data32S: [x0,y0,x1,y1,...]）から係数を計算（簡略版）
 */
export function calculateEFD(contour: any, numHarmonics: number): number[] {
  // OpenCV には非依存。contour.data32S を使うだけ。
  const points: Int32Array = contour?.data32S;
  const N = Math.floor((points?.length ?? 0) / 2);
  if (!points || N < 2) return Array(numHarmonics * 4).fill(0);

  const deltaT = 1 / N;

  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const d: number[] = [];

  for (let n = 1; n <= numHarmonics; n++) {
    let An = 0, Bn = 0, Cn = 0, Dn = 0;

    for (let i = 0; i < N; i++) {
      const x0 = points[i * 2],     y0 = points[i * 2 + 1];
      const x1 = points[((i + 1) % N) * 2], y1 = points[((i + 1) % N) * 2 + 1];

      const dx = x1 - x0;
      const dy = y1 - y0;

      const t0 = i * deltaT;
      const t1 = (i + 1) * deltaT;

      const term1 = (Math.cos(2 * Math.PI * n * t1) - Math.cos(2 * Math.PI * n * t0)) / (2 * Math.PI * n);
      const term2 = (Math.sin(2 * Math.PI * n * t1) - Math.sin(2 * Math.PI * n * t0)) / (2 * Math.PI * n);

      An += dx * term1;  Bn += dx * term2;
      Cn += dy * term1;  Dn += dy * term2;
    }

    a.push(An); b.push(Bn); c.push(Cn); d.push(Dn);
  }

  // 簡易正規化
  const A1 = a[0], B1 = b[0];
  const L0 = Math.hypot(A1, B1) || 1;
  const theta = Math.atan2(A1, B1);

  const normalized: number[] = [];
  for (let n = 0; n < numHarmonics; n++) {
    const ct = Math.cos((n + 1) * theta);
    const st = Math.sin((n + 1) * theta);
    const Anp = (a[n] * ct + b[n] * st) / L0;
    const Bnp = (-a[n] * st + b[n] * ct) / L0;
    const Cnp = (c[n] * ct + d[n] * st) / L0;
    const Dnp = (-c[n] * st + d[n] * ct) / L0;
    normalized.push(Anp, Bnp, Cnp, Dnp);
  }

  return normalized;
}
