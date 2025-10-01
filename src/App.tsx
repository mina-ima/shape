import { useEffect } from "react";
import { useStore, MAX_RETRIES } from "./core/store";
import { runProcessing } from "./processing";
import { LoadingCloud } from "./ui/LoadingCloud";

const INITIAL_BACKOFF_DELAY = 1000; // 1 second

function App() {
  const {
    status,
    error,
    resolution,
    retryCount,
    unsplashApiKey,
    startProcessing,
    setSuccess,
    setError,
    handleProcessingError,
    incrementRetryCount,
    logErrorToLocalStorage,
    setUnsplashApiKey,
    reset,
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
    if (!unsplashApiKey) {
      setError(
        "Unsplash API Key is missing. Please provide it in the URL fragment (e.g., #unsplash_api_key=YOUR_KEY) or via settings.",
      );
      return;
    }
    startProcessing();
    incrementRetryCount(); // Initial attempt counts as 1
  };

  useEffect(() => {
    // This effect orchestrates the processing attempts and retries.
    const process = async () => {
      if (retryCount > MAX_RETRIES) {
        // Check against MAX_RETRIES from store
        setError("Maximum retry attempts reached.");
        logErrorToLocalStorage("Maximum retry attempts reached.");
        return;
      }

      const delay = INITIAL_BACKOFF_DELAY * Math.pow(2, retryCount - 1); // Exponential backoff
      console.log(
        `Attempt ${retryCount} with resolution ${resolution}. Next retry in ${delay / 1000}s.`,
      );

      // Introduce exponential backoff delay before the actual processing attempt
      if (retryCount > 1) {
        // No delay for the very first attempt
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        console.log(`Processing with resolution: ${resolution}`);
        // Pass the API key to runProcessing
        if (!unsplashApiKey) {
          setError("Unsplash API Key is missing.");
          logErrorToLocalStorage("Unsplash API Key is missing.");
          return;
        }
        await runProcessing(unsplashApiKey);
        // If processing succeeds, update the state to 'success'.
        setSuccess();
      } catch (e) {
        if (e instanceof Error) {
          // If processing fails, this action will handle the fallback logic.
          // It will also increment retryCount if not exhausted.
          handleProcessingError(e.message);
          incrementRetryCount(); // Increment for the next retry attempt
        }
      }
    };

    // Only run the process if the status is 'processing' and API key is available.
    if (status === "processing" && unsplashApiKey) {
      process();
    }
    // The dependencies are crucial. The effect re-runs if the status or resolution changes.
  }, [
    status,
    resolution,
    retryCount,
    unsplashApiKey,
    startProcessing,
    setSuccess,
    setError,
    handleProcessingError,
    incrementRetryCount,
    logErrorToLocalStorage,
  ]);

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
            <p>処理中... (解像度: {resolution})</p>
            {retryCount > 0 && retryCount <= MAX_RETRIES && (
              <p>
                再試行回数: {retryCount}/{MAX_RETRIES}
              </p>
            )}
          </div>
        );
      case "success":
        return (
          <div>
            <h2>成功!</h2>
            <button onClick={reset}>もう一度</button>
          </div>
        );
      case "error":
        return (
          <div>
            <h2>エラー</h2>
            <p>{error}</p>
            <button onClick={reset}>リトライ</button>
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
