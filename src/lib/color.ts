// src/lib/color.ts
// 目的: 軽量な色操作とドミナントカラー抽出（平均色＋彩度/明度補正）

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export function rgb(r: number, g: number, b: number): RGB {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}
export function hslToRgb({ h, s, l }: HSL): RGB {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < .5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return rgb(r * 255, g * 255, b * 255);
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  const u = clamp01(t);
  return rgb(a.r + (b.r - a.r) * u, a.g + (b.g - a.g) * u, a.b + (b.b - a.b) * u);
}

/** 0..1で明るさ/彩度を調整（HSL空間） */
export function adjustHsl(base: RGB, ds: number, dl: number): RGB {
  const hsl = rgbToHsl(base);
  const out: HSL = {
    h: hsl.h,
    s: clamp01(hsl.s + ds),
    l: clamp01(hsl.l + dl),
  };
  return hslToRgb(out);
}

/** 画像(CanvasImageSource)の簡易平均色（最大辺192pxに縮小し平均） */
export function averageColorOfImage(img: CanvasImageSource, w?: number, h?: number): RGB {
  const W = (img as any).videoWidth ?? (img as any).naturalWidth ?? (img as any).width ?? w ?? 1;
  const H = (img as any).videoHeight ?? (img as any).naturalHeight ?? (img as any).height ?? h ?? 1;
  const scale = Math.min(192 / Math.max(W, H), 1);
  const sw = Math.max(1, Math.round(W * scale));
  const sh = Math.max(1, Math.round(H * scale));
  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img as any, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let r = 0, g = 0, b = 0;
  const n = sw * sh;
  for (let i = 0; i < n; i++) {
    r += data[i*4+0]; g += data[i*4+1]; b += data[i*4+2];
  }
  return rgb(r / n, g / n, b / n);
}

/** RGB3ch配列からの平均色（高速サンプリング） */
export function averageColorOfRGB(rgb3: Uint8Array, w: number, h: number, step = 8): RGB {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = 0; y < h; y += step) {
    const base = y * w * 3;
    for (let x = 0; x < w; x += step) {
      const i = base + x * 3;
      r += rgb3[i + 0]; g += rgb3[i + 1]; b += rgb3[i + 2];
      count++;
    }
  }
  if (!count) return rgb(127,127,127);
  return rgb(r / count, g / count, b / count);
}
