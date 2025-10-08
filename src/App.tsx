import { useEffect } from "react";
import { useStore, MAX_RETRIES } from "./core/store";
import LoadingCloud from "./ui/LoadingCloud";

function App() {
   const {
       status,
        error,
        processingResolution,
        retryCount,
        unsplashApiKey,
        setUnsplashApiKey,
      } = useStore();

  // Effect to read API key from URL fragment on initial load
  useEffect(() => {
    const fragment = window.location.hash;
    const params = new URLSearchParams(fragment.substring(1)); // Remove #
    const apiKey = params.get("unsplash_api_key");

    if (apiKey) {
      setUnsplashApiKey(apiKey);
      // Optionally, clean the URL fragment after reading
      // window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [setUnsplashApiKey]);

  const handleInitialStart = () => {
       // 常に最新の store 関数を呼び出す（テストの spy が確実に拾える）
        const fn = useStore.getState().startProcessFlow;
        fn();
  };

  const renderContent = () => {
    switch (status) {
      case "idle":
        return (
          <div>
            {!unsplashApiKey && (
              <p style={{ color: "red" }}>
                Unsplash API Key is missing. Please provide it in the URL
                fragment (e.g., #unsplash_api_key=YOUR_KEY) or via settings.
              </p>
            )}
            <button onClick={handleInitialStart} disabled={!unsplashApiKey}>
              撮影/選択
            </button>
          </div>
        );
      case "processing":
        return (
          <div>
            <LoadingCloud />
            <p>処理中... (解像度: {processingResolution})</p>
            {retryCount > 0 && retryCount <= MAX_RETRIES && (
              <p>
                Attempt: {retryCount}/{MAX_RETRIES}
              </p>
            )}
          </div>
        );
      case "success":
        return (
          <div>
            <h2>成功!</h2>
            <button onClick={() => useStore.getState().reset()}>もう一度</button>
          </div>
        );
      case "error":
        return (
          <div>
            <h2>エラー</h2>
            <p>{error}</p>
            <button onClick={() => useStore.getState().reset()}>リトライ</button>
          </div>
        );
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        textAlign: "center",
      }}
    >
      {renderContent()}
    </div>
  );
}

export default App;