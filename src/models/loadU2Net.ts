// src/models/loadU2Net.ts
/* eslint-disable no-console */

/**
 * 目的:
 * - まず /models/u2netp.onnx を使う（軽量で精度十分）
 * - 旧URL（/models/u2net.onnx）へのアクセスを避け、404ログを消す
 * - 配信環境で HEAD が落ちる場合に備え、Range: bytes=0-0 で存在確認
 * - onnxruntime-web のセッションを簡単に作れるユーティリティを提供
 */

export type U2NetVariant = 'u2netp'; // 将来拡張を見据えて型を用意

/**
 * モデルURLを解決。現状は常に `u2netp.onnx` を返す。
 * 必要に応じて存在確認を行い、失敗時は明確なエラーを投げる。
 */
export async function resolveU2NetModelUrl(
  variant: U2NetVariant = 'u2netp',
  basePath = '/models',
): Promise<string> {
  const filename = variant === 'u2netp' ? 'u2netp.onnx' : 'u2netp.onnx';
  const url = `${basePath}/${filename}`;

  // HEAD で存在確認（許可されていない環境もある）
  try {
    const head = await safeFetch(url, { method: 'HEAD' });
    if (head.ok) return url;
  } catch {
    /* ignore and try range check */
  }

  // Range: bytes=0-0 で軽量チェック
  try {
    const probe = await safeFetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    if (probe.ok) return url;
    throw new Error(`Model probe failed with status ${probe.status}`);
  } catch (e) {
    // ここで旧 u2net.onnx にはフォールバックしない（存在しても重く404誘発の元）
    throw new Error(
      `[U2Net] Model not found at ${url}. ` +
        `Make sure the file is deployed under public/models/u2netp.onnx. Original error: ${(e as Error)?.message || e}`,
    );
  }
}

/**
 * onnxruntime-web の InferenceSession を生成。
 * - 実行プロバイダは WASM 固定（SIMD/マルチスレッドはランタイムが自動選択）
 * - スレッド数はハードウェア並列数に基づく控えめ設定
 */
export async function loadU2NetSession(
  ort: typeof import('onnxruntime-web'),
  opts?: {
    modelVariant?: U2NetVariant;
    modelBasePath?: string;
    numThreads?: number;
  },
): Promise<import('onnxruntime-web').InferenceSession> {
  const modelUrl = await resolveU2NetModelUrl(opts?.modelVariant ?? 'u2netp', opts?.modelBasePath);

  // 環境設定（必要最低限）
  try {
    const threads =
      typeof opts?.numThreads === 'number'
        ? Math.max(1, opts.numThreads)
        : Math.min(4, Math.max(1, (navigator as any)?.hardwareConcurrency || 2));
    // @ts-ignore - env は型に出ないことがある
    if (ort?.env?.wasm) {
      // @ts-ignore
      ort.env.wasm.numThreads = threads;
      // @ts-ignore
      ort.env.wasm.simd = true; // ブラウザ対応時のみ有効になる
    }
  } catch {
    /* 環境によっては無視してよい */
  }

  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  console.log('[Model] Using ONNX:', modelUrl);
  return session;
}

/* ---------------- 内部: fetch ヘルパ ---------------- */

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // 一部環境で no-cors を使いたくなるが、opaque で .ok 判定ができなくなるため避ける
  const res = await fetch(input, { ...init, redirect: 'follow', cache: 'no-store' });
  return res;
}
