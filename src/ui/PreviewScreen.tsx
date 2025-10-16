import React, { useEffect, useRef } from "react";
import { saveFile, MimeType } from "../storage/save";

interface PreviewScreenProps {
  videoBlob: Blob;
}

const PreviewScreen: React.FC<PreviewScreenProps> = ({ videoBlob }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (videoBlob) {
      const url = URL.createObjectURL(videoBlob);
      objectUrlRef.current = url;
      if (videoRef.current) {
        videoRef.current.src = url;
      }
    }

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, [videoBlob]);

  const handleSave = async () => {
    const mimeType = videoBlob.type as MimeType;
    await saveFile(videoBlob, mimeType);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#f0f0f0",
        padding: "20px",
      }}
    >
      <video
        ref={videoRef}
        data-testid="preview-video"
        width="320"
        height="240"
        controls
        autoPlay
        loop
        playsInline
        muted
        style={{ marginBottom: "20px", maxWidth: "100%" }}
      />
      <button
        onClick={handleSave}
        style={{
          padding: "10px 20px",
          fontSize: "1.2em",
          cursor: "pointer",
          marginRight: "10px", // Add some spacing between buttons
        }}
      >
        保存
      </button>
      <button
        onClick={() => console.log("共有ボタンがクリックされました")}
        style={{
          padding: "10px 20px",
          fontSize: "1.2em",
          cursor: "pointer",
        }}
      >
        共有
      </button>
    </div>
  );
};

export default PreviewScreen;
