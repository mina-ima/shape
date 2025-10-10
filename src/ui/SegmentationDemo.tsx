// src/ui/SegmentationDemo.tsx
import React, { useRef, useState } from "react";
import { runSegmentation } from "@/processing";

const SegmentationDemo: React.FC = () => {
  const [info, setInfo] = useState<string>(
    "画像を選んで「セグメント実行」を押してください。",
  );
  const [imgURL, setImgURL] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setImgURL(url);
    setInfo(`選択: ${f.name} (${Math.round(f.size / 1024)} KB)`);
  }

  async function handleRun() {
    if (!imgRef.current || !canvasRef.current) {
      alert("画像を選択してください");
      return;
    }
    setInfo("推論中...");
    const img = imgRef.current;

    // ImageBitmap にして高速デコード（SafariはHTMLImageElementでも可）
    const bmp = await createImageBitmap(img);

    try {
      const { mask, inputSize } = await runSegmentation(bmp);
      // マスクをキャンバスに表示
      const cvs = canvasRef.current;
      cvs.width = mask.width;
      cvs.height = mask.height;
      const ctx = cvs.getContext("2d")!;
      ctx.putImageData(mask, 0, 0);
      setInfo(
        `完了: 入力 ${inputSize.w}x${inputSize.h}, マスク ${mask.width}x${mask.height}`,
      );
    } catch (e: any) {
      setInfo(`エラー: ${e?.message ?? e}`);
      console.error(e);
    }
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 8,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Segmentation Demo</h2>
      <p style={{ margin: "8px 0", color: "#555" }}>{info}</p>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div>
          <input type="file" accept="image/*" onChange={handleFile} />
          <div style={{ marginTop: 8 }}>
            <button
              onClick={handleRun}
              disabled={!imgURL}
              style={{ padding: "8px 12px", borderRadius: 6 }}
            >
              セグメント実行
            </button>
          </div>
          {imgURL && (
            <img
              ref={imgRef}
              src={imgURL}
              alt="input"
              style={{
                marginTop: 12,
                maxWidth: 300,
                border: "1px solid #eee",
                borderRadius: 6,
              }}
            />
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#666" }}>出力マスク</div>
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              marginTop: 8,
              border: "1px solid #eee",
              borderRadius: 6,
            }}
          />
        </div>
      </div>
    </section>
  );
};

export default SegmentationDemo;
