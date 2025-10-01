import { useEffect } from "react";
import { useStore } from "./core/store";
import { runProcessing } from "./processing";
import { LoadingCloud } from "./ui/LoadingCloud";

function App() {
  const {
    status,
    error,
    resolution,
    startProcessing,
    setSuccess,
    handleProcessingError,
    reset,
  } = useStore();

  const handleInitialStart = () => {
    startProcessing();
  };

  useEffect(() => {
    // This effect orchestrates the processing attempts and retries.
    const process = async () => {
      try {
        console.log(`Processing with resolution: ${resolution}`);
        await runProcessing();
        // If processing succeeds, update the state to 'success'.
        setSuccess();
      } catch (e) {
        if (e instanceof Error) {
          // If processing fails, this action will handle the fallback logic.
          handleProcessingError(e.message);
        }
      }
    };

    // Only run the process if the status is 'processing'.
    // The state changes within handleProcessingError will trigger this effect again
    // with a new resolution, creating the retry loop.
    if (status === "processing") {
      process();
    }
    // The dependencies are crucial. The effect re-runs if the status or resolution changes.
  }, [status, resolution, setSuccess, handleProcessingError]);

  const renderContent = () => {
    switch (status) {
      case "idle":
        return <button onClick={handleInitialStart}>撮影/選択</button>;
      case "processing":
        return (
          <div>
            <LoadingCloud />
            <p>処理中... (解像度: {resolution})</p>
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
