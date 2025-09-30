import React, { useEffect, useState } from "react";

interface AttributionToastProps {
  message: string;
  attribution?: string;
  attributionUrl?: string; // New prop for the attribution link
  onClose: () => void;
  duration?: number; // ms
}

const AttributionToast: React.FC<AttributionToastProps> = ({
  message,
  attribution,
  attributionUrl,
  onClose,
  duration = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        color: "white",
        padding: "15px 20px",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 1000,
        maxWidth: "90%",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
      }}
    >
      <p style={{ margin: "0 0 5px 0", textAlign: "center" }}>{message}</p>
      {attribution && (
        <p style={{ margin: "0", fontSize: "0.8em", textAlign: "center" }}>
          {attributionUrl ? (
            <a
              href={attributionUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "white", textDecoration: "underline" }}
            >
              {attribution}
            </a>
          ) : (
            attribution
          )}
        </p>
      )}
      <button
        onClick={handleClose}
        style={{
          background: "none",
          border: "1px solid white",
          color: "white",
          borderRadius: "4px",
          padding: "5px 10px",
          marginTop: "10px",
          cursor: "pointer",
        }}
      >
        閉じる
      </button>
    </div>
  );
};

export default AttributionToast;
