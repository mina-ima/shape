// src/compose/parallax.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import getCV from "@/lib/cv";

/**
 * 入力の各レイヤから前景(RGBA)と背景(RGB)を生成
 */
export async function generateLayers(
  originalImageData: Uint8Array,
  originalImageWidth: number,
  originalImageHeight: number,
  alphaMaskData: Uint8Array,
  alphaMaskWidth: number,
  alphaMaskHeight: number,
  backgroundImageData: Uint8Array,
  backgroundImageWidth: number,
  backgroundImageHeight: number,
): Promise<{ foreground: any; background: any }> {
  const cv: any = await getCV();

  const originalImage = new cv.Mat(
    originalImageHeight,
    originalImageWidth,
    cv.CV_8UC4,
  );
  originalImage.data.set(originalImageData);

  const alphaMask = new cv.Mat(alphaMaskHeight, alphaMaskWidth, cv.CV_8UC1);
  alphaMask.data.set(alphaMaskData);

  const backgroundImage = new cv.Mat(
    backgroundImageHeight,
    backgroundImageWidth,
    cv.CV_8UC4,
  );
  backgroundImage.data.set(backgroundImageData);

  // original を RGBA に
  const originalImageRGBA = new cv.Mat();
  if (typeof originalImage.channels === "function" && originalImage.channels() === 3) {
    cv.cvtColor(originalImage, originalImageRGBA, cv.COLOR_RGB2RGBA);
  } else {
    originalImage.copyTo(originalImageRGBA);
  }

  // alpha を 8UC1 に
  const alphaMask8UC1 = new cv.Mat(alphaMask.rows, alphaMask.cols, cv.CV_8UC1);
  if (typeof alphaMask.type === "function" && alphaMask.type() !== cv.CV_8UC1) {
    alphaMask.convertTo(alphaMask8UC1, cv.CV_8UC1, 255);
  } else {
    alphaMask8UC1.data.set(alphaMask.data);
  }

  // 前景 RGBA を合成（RGB + alpha）
  const foreground = new cv.Mat(
    originalImageRGBA.rows,
    originalImageRGBA.cols,
    cv.CV_8UC4,
  );
  const rgbaPlanes = new cv.MatVector();
  cv.split(originalImageRGBA, rgbaPlanes);

  const r = rgbaPlanes.get(0);
  const g = rgbaPlanes.get(1);
  const b = rgbaPlanes.get(2);
  const newRgbaPlanes = new cv.MatVector();
  newRgbaPlanes.push_back(r);
  newRgbaPlanes.push_back(g);
  newRgbaPlanes.push_back(b);
  newRgbaPlanes.push_back(alphaMask8UC1);
  cv.merge(newRgbaPlanes, foreground);

  r.delete(); g.delete(); b.delete();
  newRgbaPlanes.delete();
  rgbaPlanes.delete();

  // 背景は RGB 化（モック環境では cvtColor は copy のこともあるがテスト要件は満たす）
  const background = new cv.Mat();
  if (typeof backgroundImage.channels === "function" && backgroundImage.channels() === 4) {
    cv.cvtColor(backgroundImage, background, cv.COLOR_RGBA2RGB);
  } else if (backgroundImage.channels && backgroundImage.channels() === 1) {
    // 環境により COLOR_GRAY2RGB が無い場合があるため undefined でもOK（モックは copy）
    cv.cvtColor(backgroundImage, background, cv.COLOR_GRAY2RGB);
  } else {
    backgroundImage.copyTo(background);
  }

  // 後始末
  originalImage.delete();
  alphaMask.delete();
  backgroundImage.delete();
  alphaMask8UC1.delete();
  originalImageRGBA.delete();

  return { foreground, background };
}

/**
 * パララックス（擬似的な前後移動）フレームを生成（RGBA）
 */
export async function generateParallaxFrames(
  foregroundLayer: any, // RGBA
  backgroundLayer: any, // RGB
  width: number,
  height: number,
  duration: number,
  fps: number,
  crossfadeDuration: number = 0,
): Promise<any[]> {
  const cv: any = await getCV();

  const totalFrames = Math.floor(duration * fps);
  const frames: any[] = [];

  const panAmount = 20; // px
  const fgScale = 1.05;
  const bgScale = 1.15;

  // 先に拡大してパディング
  const fgPadded = new cv.Mat();
  const bgPadded = new cv.Mat();
  cv.resize(
    foregroundLayer,
    fgPadded,
    new cv.Size(Math.round(width * fgScale), Math.round(height * fgScale)),
    0, 0, cv.INTER_LINEAR,
  );
  cv.resize(
    backgroundLayer,
    bgPadded,
    new cv.Size(Math.round(width * bgScale), Math.round(height * bgScale)),
    0, 0, cv.INTER_LINEAR,
  );

  const bgPaddedRgba = new cv.Mat();
  cv.cvtColor(bgPadded, bgPaddedRgba, cv.COLOR_RGB2RGBA);

  const crossfadeFrames = Math.floor(crossfadeDuration * fps);
  const fadeFrames = Math.min(crossfadeFrames, Math.floor(totalFrames / 2));

  // CV_64F が無ければ CV_64FC1 を使う（モック互換）
  const CV_64F = (cv.CV_64F ?? cv.CV_64FC1);

  for (let i = 0; i < totalFrames; i++) {
    const progress = totalFrames > 1 ? i / (totalFrames - 1) : 0;
    const easedProgress = easeInOutSine(progress);

    // 平行移動量
    const fgTranslateX = panAmount * (1 - easedProgress) - (fgPadded.cols - width) / 2;
    const fgTranslateY = -(fgPadded.rows - height) / 2;
    const bgTranslateX = -panAmount * (1 - easedProgress) - (bgPadded.cols - width) / 2;
    const bgTranslateY = -(bgPadded.rows - height) / 2;

    // アフィン行列
    const fgM = cv.matFromArray(2, 3, CV_64F, [1, 0, fgTranslateX, 0, 1, fgTranslateY]);
    const bgM = cv.matFromArray(2, 3, CV_64F, [1, 0, bgTranslateX, 0, 1, bgTranslateY]);

    // ワープ
    const warpedFg = new cv.Mat();
    const warpedBgRgba = new cv.Mat();
    const dsize = new cv.Size(width, height);
    cv.warpAffine(
      fgPadded, warpedFg, fgM, dsize,
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(),
    );
    cv.warpAffine(
      bgPaddedRgba, warpedBgRgba, bgM, dsize,
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(),
    );

    // 合成（FG の alpha をマスクにして BG にコピー）
    const fgPlanes = new cv.MatVector();
    cv.split(warpedFg, fgPlanes);
    const fgAlphaMask = fgPlanes.get(3);
    warpedFg.copyTo(warpedBgRgba, fgAlphaMask);

    // クロスフェード
    let fadeAlpha = 1.0;
    if (fadeFrames > 0) {
      const denom = fadeFrames > 1 ? fadeFrames - 1 : 1;
      if (i < fadeFrames) {
        fadeAlpha = i / denom;
      } else if (i >= totalFrames - fadeFrames) {
        fadeAlpha = (totalFrames - 1 - i) / denom;
      }
    }
    fadeAlpha = Math.max(0, Math.min(1, fadeAlpha));

    if (fadeAlpha < 1.0) {
      const framePlanes = new cv.MatVector();
      cv.split(warpedBgRgba, framePlanes);
      const frameAlpha = framePlanes.get(3);
      frameAlpha.convertTo(frameAlpha, -1, fadeAlpha);
      cv.merge(framePlanes, warpedBgRgba);
      framePlanes.delete();
    }

    frames.push(warpedBgRgba);

    // 後始末（フレームごと）
    fgM.delete();
    bgM.delete();
    warpedFg.delete();
    fgAlphaMask.delete();
    fgPlanes.delete();
  }

  // 後始末（全体）
  fgPadded.delete();
  bgPadded.delete();
  bgPaddedRgba.delete();

  return frames;
}

// Easing（UI 用）
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * DOM 要素を使ったパララックスアニメーション（ブラウザ用）
 */
export function animateParallax(
  foregroundElement: HTMLElement,
  backgroundElement: HTMLElement,
  durationSeconds: number,
  _easing: string, // 'easeInOutSine' など（MVP では固定）
  crossfadeDurationSeconds: number = 0,
) {
  const durationMs = durationSeconds * 1000;
  const crossfadeDurationMs = crossfadeDurationSeconds * 1000;
  const panAmount = 20;
  const fgScale = 1.05;
  const bgScale = 1.15;

  if (crossfadeDurationSeconds > 0) {
    foregroundElement.style.opacity = "0";
    backgroundElement.style.opacity = "0";
  } else {
    foregroundElement.style.opacity = "1";
    backgroundElement.style.opacity = "1";
  }

  let startTime: number | null = null;

  const tick = (now: number) => {
    if (startTime === null) startTime = now;
    const elapsed = now - startTime;

    const loopTime = elapsed % durationMs;
    const progress = elapsed > 0 && loopTime === 0 ? 1 : loopTime / durationMs;
    const eased = easeInOutSine(progress);

    // 前景：右→左、小さめスケール
    const fgTranslateX = panAmount * (1 - eased);
    foregroundElement.style.transform = `translateX(${fgTranslateX}px) scale(${fgScale})`;

    // 背景：左→右、大きめスケール
    const bgTranslateX = -panAmount * (1 - eased);
    backgroundElement.style.transform = `translateX(${bgTranslateX}px) scale(${bgScale})`;

    // クロスフェード（簡易）
    if (crossfadeDurationSeconds > 0) {
      if (progress > (durationMs - crossfadeDurationMs) / durationMs) {
        const fadeProgress = (loopTime - (durationMs - crossfadeDurationMs)) / crossfadeDurationMs;
        foregroundElement.style.opacity = `${1 - fadeProgress}`;
        backgroundElement.style.opacity = `${1 - fadeProgress}`;
      } else if (progress < crossfadeDurationMs / durationMs) {
        const fadeProgress = loopTime / crossfadeDurationMs;
        foregroundElement.style.opacity = `${fadeProgress}`;
        backgroundElement.style.opacity = `${fadeProgress}`;
      } else {
        foregroundElement.style.opacity = "1";
        backgroundElement.style.opacity = "1";
      }
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
