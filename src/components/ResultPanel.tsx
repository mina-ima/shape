// src/components/ResultPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../core/store"; // 相対パス
import {
  bindVideoSource,
  bindDownloadAnchor,
  openInNewTab,
} from "../utils/mediaDownload"; // 相対パス

type Mime = "video/webm" | "video/mp4";
type ResultMeta = { blob: Blob; filename: string; mime: Mime };

/** store の result が無い場合でも、旧フィールドから擬似 Result を作る */
function useResultMeta(): ResultMeta | undefined {
  // 将来の拡張用（store.result がある構成を最優先）
  const result = (useStore as any)((s: any) => s.result);

  // 現在の実装（generatedVideoBlob / generatedVideoMimeType）を後方互換で拾う
  const legacyBlob = (useStore as any)((s: any) => s.generatedVideoBlob as Blob | null);
  const legacyMime = (useStore as any)((s: any) => s.generatedVideoMimeType as string | null);

  return useMemo(() => {
    if (result?.blob && result?.filename && result?.mime) return result;

    if (legacyBlob && legacyBlob.size > 0) {
      const mime: Mime =
        ((legacyMime as Mime) ||
          ((legacyBlob.type as Mime) || "video/webm")) as Mime;
      const filename = mime === "video/mp4" ? "output.mp4" : "output.webm";
      return { blob: legacyBlob, filename, mime };
    }
    return undefined;
  }, [result, legacyBlob, legacyMime]);
}

export default function ResultPanel() {
  const status = (useStore as any)((s: any) => s.status as "idle" | "processing" | "success" | "error");
  const error = (useStore as any)((s: any) => s.error as string | null);

  const result = useResultMeta();

  const videoRef = useRef<HTMLVideoElement>(null);
  const aRef = useRef<HTMLAnchorElement>(null);

  // revoke用に現在のURLを保持
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // 結果が変わったら video / a を更新
  useEffect(() => {
    const revoke = (u: string | null) => {
      if (u) {
        try { URL.revokeObjectURL(u); } catch { /* noop */ }
      }
    };

    if (!result) {
      revoke(videoUrl);
      revoke(downloadUrl);
      setVideoUrl(null);
      setDownloadUrl(null);
      return;
    }

    if (videoRef.current) {
      const u = bindVideoSource(
        videoRef.current,
        { blob: result.blob, filename: result.filename },
        videoUrl || undefined
      );
      setVideoUrl(u);
      // 自動再生はユーザー操作が必要なブラウザもあるため無理に play() しない
      // videoRef.current.play().catch(() => {});
    }

    if (aRef.current) {
      const u = bindDownloadAnchor(
        aRef.current,
        { blob: result.blob, filename: result.filename },
        downloadUrl || undefined
      );
      setDownloadUrl(u);
    }

    return () => {
      revoke(videoUrl);
      revoke(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // UI 表示制御
  if (status === "idle" || status === "processing") {
    return (
      <aside style={{ padding: 12 }}>
        {status === "processing" ? (
          <p>生成中です…</p>
        ) : (
          <p>カメラで撮影するか画像を選択して開始してください。</p>
        )}
      </aside>
    );
  }

  if (status === "error") {
    return (
      <aside style={{ padding: 12, color: "#d00" }}>
        <p>エラー: {error ?? "不明なエラー"}</p>
      </aside>
    );
  }

  if (status === "success" && !result) {
    return (
      <aside style={{ padding: 12 }}>
        <p>生成は成功と表示されましたが、プレビュー対象が見つかりません。</p>
      </aside>
    );
  }

  const isMP4 = result!.mime === "video/mp4";

  return (
    <aside style={{ padding: 12, display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>結果プレビュー</h3>

      <video
        ref={videoRef}
        id="preview"
        controls
        playsInline
        style={{ width: "100%", maxHeight: 480, background: "#000" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* <a download> が使える環境ではそのままDL。iOS Safari等では onClick フォールバック */}
        <a
          ref={aRef}
          id="download"
          href="#"
          onClick={(ev) => {
            const supportsDownload = "download" in HTMLAnchorElement.prototype;
            if (!supportsDownload) {
              ev.preventDefault();
              openInNewTab({ blob: result!.blob, filename: result!.filename });
            }
          }}
          className="btn"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            textDecoration: "none",
          }}
        >
          Download {isMP4 ? "MP4" : "WEBM"}
        </a>

        <button
          type="button"
          onClick={() => openInNewTab({ blob: result!.blob, filename: result!.filename })}
          className="btn-secondary"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#f7f7f7",
          }}
        >
          Open in new tab
        </button>
      </div>

      <small style={{ color: "#666" }}>
        * 一部のブラウザ（特に iOS Safari）では「Download」が無効化されるため、
        「Open in new tab」で保存メニューから保存してください。
      </small>
    </aside>
  );
}
