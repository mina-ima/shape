// src/encode/encoder.ts
import cv from "@techstark/opencv-js";
import { encodeWithWebCodecs } from "./webcodecs";
import { encodeWithMediaRecorder } from "./mediarec";
import { encodeWithFFmpeg } from "./ffmpeg";

/* ---------- 再生能力の実機判定 & 優先 MIME 決定 ---------- */

/** ブラウザの実再生能力を調べる（trueならその MIME が再生できる見込み） */
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

/**
 * 優先 MIME を決める。
 * - localStorage の 'FORCE_MIME' が 'mp4' or 'webm' の場合はそれを最優先
 * - それ以外は canPlayType による実機判定で mp4 優先 → webm
 * - どちらも空なら既定で webm（後段でフォールバック試行）
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

/** Blob.type が空や不正のときだけ MIME を補正する */
function ensureBlobType(blob: Blob, mime: string): Blob {
  if (blob.type) return blob; // 既に type が付いているなら尊重
  return new Blob([blob], { type: mime });
}

/** WebCodecs は現状 WebM 系のみ利用（MP4 コンテナは不可） */
function canUseWebCodecsFor(mime: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).VideoEncoder !== "function") return false;
  return mime === "video/webm";
}

/** MediaRecorder が使えるか（isTypeSupported を考慮） */
function canUseMediaRecorderFor(mime: string): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).MediaRecorder !== "function") return false;
  const MR: any = (window as any).MediaRecorder;
  return typeof MR.isTypeSupported === "function" ? !!MR.isTypeSupported(mime) : true;
}

/* ---------- メイン：フレーム配列を動画化 ---------- */

export async function encodeVideo(frames: cv.Mat[], fps: number): Promise<Blob> {
  const preferred = getPreferredMimeType();
  const alternative = preferred === "video/webm" ? "video/mp4" : "video/webm";

  // まずは「実機で再生できそうな順」で候補を並べる
  const playOrder: Array<"video/mp4" | "video/webm"> = [];
  const prefOK = canPlay(preferred as any);
  const altOK = canPlay(alternative as any);
  if (prefOK) playOrder.push(preferred);
  if (altOK) playOrder.push(alternative);
  if (!playOrder.length) playOrder.push(preferred, alternative); // どちらも空でも試す

  // 優先 ①MediaRecorder（コンテナ確実）→ ②WebCodecs（WebMのみ）→ ③ffmpeg.wasm
  // playOrder の順に MIME を差し替えつつ試行
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

    // 2) WebCodecs（WebM のみ）
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

    // 3) ffmpeg.wasm（将来の最終手段）
    try {
      const blob = await encodeWithFFmpeg(frames, fps, mt);
      const out = ensureBlobType(blob, mt);
      console.log(`Encoded with ffmpeg.wasm as ${out.type || mt}`);
      return out;
    } catch (e) {
      console.warn(`ffmpeg.wasm failed with ${mt}.`, e);
    }
  }

  // ここまでで全滅したら、最後に逆順で念押し（稀に isTypeSupported と実挙動が食い違う端末対策）
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
