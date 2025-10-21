// src/encode/encoder.ts
import cv from "@techstark/opencv-js";
import { encodeWithWebCodecs } from "./webcodecs";
import { encodeWithMediaRecorder } from "./mediarec";
import { encodeWithFFmpeg } from "./ffmpeg";

/* ===================== ユーティリティ ===================== */

/** ブラウザの実再生能力を調べる（true ならその MIME を再生できる見込み） */
function canPlay(mimeBase: "video/mp4" | "video/webm"): boolean {
  if (typeof document === "undefined") return false;
  const v = document.createElement("video");
  const candidates =
    mimeBase === "video/mp4"
      ? [
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
          'video/mp4; codecs="avc1.4d401e"',
          "video/mp4",
        ]
      : [
          'video/webm; codecs="vp9,opus"',
          'video/webm; codecs="vp8,opus"',
          "video/webm",
        ];
  return candidates.some((mt) => v.canPlayType(mt) !== "");
}

/** captureStream が使えるか（Android WebView 等は false） */
function hasCanvasCaptureStream(): boolean {
  if (typeof HTMLCanvasElement === "undefined") return false;
  return typeof (HTMLCanvasElement.prototype as any).captureStream === "function";
}

/**
 * 優先 MIME を決める。
 * - localStorage 'FORCE_MIME': 'mp4' | 'webm' で強制
 * - それ以外は canPlayType による実機判定で mp4 優先 → webm
 * - 両方空でもとりあえず webm
 */
export function getPreferredMimeType(): "video/webm" | "video/mp4" {
  if (typeof window !== "undefined") {
    const forced = localStorage.getItem("FORCE_MIME");
    if (forced === "mp4") return "video/mp4";
    if (forced === "webm") return "video/webm";
  }
  const mp4OK = canPlay("video/mp4");
  const webmOK = canPlay("video/webm");
  if (mp4OK) return "video/mp4";
  if (webmOK) return "video/webm";
  return "video/webm";
}

/** Blob.type が空や不正のときだけ MIME を補正する（既存 type は尊重） */
function ensureBlobType(blob: Blob, mime: string): Blob {
  if (blob.type) return blob;
  return new Blob([blob], { type: mime });
}

/** WebCodecs は現状 WebM 系のみ利用（MP4 コンテナは不可） */
function canUseWebCodecsFor(mime: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).VideoEncoder !== "function") return false;
  return mime === "video/webm";
}

/** MediaRecorder が使えるか（isTypeSupported と captureStream を考慮） */
function canUseMediaRecorderFor(mime: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).MediaRecorder !== "function") return false;
  // Canvas.captureStream が無いと描画フレーム列を録れない
  if (!hasCanvasCaptureStream()) return false;
  const MR: any = (window as any).MediaRecorder;
  return typeof MR.isTypeSupported === "function" ? !!MR.isTypeSupported(mime) : true;
}

/* ===================== 本体：動画エンコード ===================== */

export async function encodeVideo(frames: cv.Mat[], fps: number): Promise<Blob> {
  const preferred = getPreferredMimeType();
  const alternative = preferred === "video/webm" ? "video/mp4" : "video/webm";

  // 実機の「再生しやすさ」を優先して MIME の試行順を作る
  const playOrder: Array<"video/mp4" | "video/webm"> = [];
  const prefOK = canPlay(preferred as any);
  const altOK = canPlay(alternative as any);
  if (prefOK) playOrder.push(preferred);
  if (altOK) playOrder.push(alternative);
  if (!playOrder.length) playOrder.push(preferred, alternative);

  // 追加ルール:
  // - MediaRecorder 不可（= captureStream 不可）の環境では、ffmpeg 経路の最初の試行を
  //   「webm を先に」へ入れ替える（Android WebView 対策）
  const captureOK = hasCanvasCaptureStream();
  if (!captureOK) {
    // webm が play 可能なら webm を先頭に
    const webmIdx = playOrder.indexOf("video/webm");
    if (webmIdx > 0) {
      playOrder.splice(webmIdx, 1);
      playOrder.unshift("video/webm");
    }
  }

  // 優先順：①MediaRecorder（コンテナ確実）→ ②WebCodecs(WebM) → ③ffmpeg.wasm
  for (const mt of playOrder) {
    // 1) MediaRecorder
    if (canUseMediaRecorderFor(mt)) {
      try {
        const blob = await encodeWithMediaRecorder(frames, fps, mt);
        const out = ensureBlobType(blob, mt);
        console.log(`Encoded with MediaRecorder as ${out.type || mt}`);
        return out;
      } catch (e) {
        console.warn(`MediaRecorder failed with ${mt}.`, e);
      }
    }

    // 2) WebCodecs（WebM のみ、muxer無し環境では再生互換が低いので MediaRecorder不可時の補助）
    if (mt === "video/webm" && canUseWebCodecsFor("video/webm")) {
      try {
        const blob = await encodeWithWebCodecs(frames, fps, "video/webm");
        const out = ensureBlobType(blob, "video/webm");
        console.log(`Encoded with WebCodecs as ${out.type || "video/webm"}`);
        return out;
      } catch (e) {
        console.warn(`WebCodecs failed with video/webm.`, e);
      }
    }

    // 3) ffmpeg.wasm（MediaRecorder不可の端末では webm 優先で実行されるよう順序調整済み）
    try {
      const blob = await encodeWithFFmpeg(frames, fps, mt);
      const out = ensureBlobType(blob, mt);
      console.log(`Encoded with ffmpeg.wasm as ${out.type || mt}`);
      return out;
    } catch (e) {
      console.warn(`ffmpeg.wasm failed with ${mt}.`, e);
    }
  }

  // 念のための再試行（稀に isTypeSupported と実挙動が食い違う端末対策）
  const rev = [...playOrder].reverse();
  for (const mt of rev) {
    if (canUseMediaRecorderFor(mt)) {
      try {
        const blob = await encodeWithMediaRecorder(frames, fps, mt);
        const out = ensureBlobType(blob, mt);
        console.log(`(Retry) Encoded with MediaRecorder as ${out.type || mt}`);
        return out;
      } catch {}
    }
  }

  throw new Error("All video encoders failed.");
}
