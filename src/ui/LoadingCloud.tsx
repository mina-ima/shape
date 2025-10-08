// src/ui/LoadingCloud.tsx
import React, { useEffect, useState } from "react";

export default function LoadingCloud() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mm = typeof window !== "undefined" ? window.matchMedia : undefined;
    const mq =
      typeof mm === "function"
        ? mm("(prefers-reduced-motion: reduce)")
        : (undefined as any);

    setReducedMotion(!!mq?.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(!!event.matches);
    };

    if (mq && "addEventListener" in mq) {
      mq.addEventListener("change", handleChange);
      return () => mq.removeEventListener("change", handleChange);
    } else if (mq && "addListener" in mq) {
      // 旧APIフォールバック
      // @ts-ignore
      mq.addListener(handleChange);
      return () => {
        // @ts-ignore
        mq.removeListener(handleChange);
      };
    }
  }, []);

  return (
    <div data-testid="loading-cloud" aria-label="loading" style={{ display: "inline-block" }}>
      {reducedMotion ? (
        // 静止表示（テストはこのテキストを期待）
        <p>読み込み中...</p>
      ) : (
        // アニメーション表示（テストは animated-cloud の存在を期待し、
        // 「読み込み中...」というテキストが無いことも確認する）
        <div
          data-testid="animated-cloud"
          role="img"
          aria-label="loading animation"
          style={{
            width: 48,
            height: 32,
            borderRadius: 16,
            // 見た目だけの簡易プレースホルダ（文字は入れない）
            background:
              "radial-gradient(circle at 30% 60%, rgba(200,200,200,.9) 0 40%, transparent 41%)," +
              "radial-gradient(circle at 55% 50%, rgba(200,200,200,.9) 0 45%, transparent 46%)," +
              "radial-gradient(circle at 75% 60%, rgba(200,200,200,.9) 0 35%, transparent 36%)",
          }}
        />
      )}
    </div>
  );
}
