import { InferenceSession, Tensor, env } from "onnxruntime-web";

let session: InferenceSession | null = null;

export async function loadOnnxModel(modelPath: string): Promise<void> {
  if (session) {
    return; // Avoid reloading if already loaded
  }
  try {
    // Explicitly set the path to the WASM backend files.
    // Vite serves the `public` directory at the root.
    env.wasm.wasmPaths = "/";
    env.wasm.numThreads = 1; // Disable threading for potentially better compatibility in test environment

    session = await InferenceSession.create(modelPath, {
      executionProviders: ["wasm"], // Explicitly use wasm backend
    });
    console.log("ONNX session loaded successfully.");
  } catch (e) {
    console.error("Failed to load ONNX model:", e);
    throw e;
  }
}

export async function runOnnxInference(inputTensor: Tensor): Promise<Tensor> {
  if (!session) {
    throw new Error("ONNX session not loaded. Call loadOnnxModel first.");
  }

  const feeds = { "input.1": inputTensor }; // 'input.1' is the expected input name for U2-Net
  const results = await session.run(feeds);

  // Assuming the model has a single output, we'll use the first one identified: '1959'
  const output = results["1959"];
  if (!output) {
    throw new Error("ONNX inference output not found.");
  }
  return output as Tensor;
}
