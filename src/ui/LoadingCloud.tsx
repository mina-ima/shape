import React, { useEffect, useState } from "react";

const LoadingCloud: React.FC = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <div
      data-testid="loading-cloud"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#f0f0f0",
        color: "#333",
        fontSize: "1.2em",
      }}
    >
      {reducedMotion ? (
        <p>読み込み中...</p>
      ) : (
        <div
          data-testid="animated-cloud"
          style={{
            width: "100px",
            height: "60px",
            backgroundColor: "#ccc",
            borderRadius: "50px",
            position: "relative",
            animation: "cloud-animation 2s infinite alternate",
          }}
        >
          {/* Simple cloud shape placeholder */}
          <div
            style={{
              width: "40px",
              height: "40px",
              backgroundColor: "#ccc",
              borderRadius: "50%",
              position: "absolute",
              top: "-20px",
              left: "10px",
            }}
          ></div>
          <div
            style={{
              width: "50px",
              height: "50px",
              backgroundColor: "#ccc",
              borderRadius: "50%",
              position: "absolute",
              top: "-30px",
              right: "10px",
            }}
          ></div>
        </div>
      )}
      <style>{`
        @keyframes cloud-animation {
          from { transform: translateY(0); }
          to { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default LoadingCloud;
