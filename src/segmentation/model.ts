import { InferenceSession, Tensor, env } from "onnxruntime-web";
import { generateLowPrecisionMask } from "./lowPrecision";
import { AppState, useStore } from '@/core/store';
import { ProcessingResolution } from '@/core/types';

let session: InferenceSession | null = null;
let lowPrecisionMode = false;

export async function loadOnnxModel(modelPath: string): Promise<void> {
  if (session) {
    return; // Avoid reloading if already loaded
  }
  try {
    // Explicitly set the path to the WASM backend files.
    // Vite serves the `public` directory at the root.
    env.wasm.wasmPaths = "/";
    // Use all available CPU cores for WASM execution, or a reasonable default
    env.wasm.numThreads = navigator.hardwareConcurrency || 4;

    session = await InferenceSession.create(modelPath, {
      // Prioritize WebGL/WebGPU if available, then fall back to WASM
      executionProviders: ["webgl", "wasm"],
    });
    console.log("ONNX session loaded successfully.");
  } catch (e) {
    console.error(
      "Failed to load ONNX model, switching to low precision mode:",
      e,
    );
    lowPrecisionMode = true;
  }
}

function getOnnxInputDimensions(
  resolution: ProcessingResolution,
): [number, number] {
  switch (resolution) {
    case 720:
      return [512, 512]; // U2-Net common input size for higher quality
    case 540:
      return [320, 320]; // U2-Net common input size for lower quality
    case 360:
      return [256, 256]; // Custom smaller size for very low resolution
    default:
      return [512, 512];
  }
}

export async function runOnnxInference(inputTensor: Tensor): Promise<Tensor> {
  const { processingResolution, setProcessingResolution } = useStore.getState();
  const [targetWidth, targetHeight] = getOnnxInputDimensions(processingResolution);

  // Simulate memory/timeout error for testing purposes - DISABLED for performance testing
  // const simulateError = Math.random() < 0.1; // 10% chance to simulate error

  if (lowPrecisionMode) {
    console.warn("Low precision mode active: Generating a placeholder mask.");
    return generateLowPrecisionMask(targetWidth, targetHeight);
  }
  if (!session) {
    throw new Error("ONNX session not loaded. Call loadOnnxModel first.");
  }

  // Adjust inputTensor dimensions if necessary (this would involve image resizing before inference)
  // For now, we'll just use the target dimensions for the output if an error occurs.
  // In a real scenario, the inputTensor itself would need to be resized to targetWidth/targetHeight.
  const currentInputWidth = inputTensor.dims[3];
  const currentInputHeight = inputTensor.dims[2];

  if (
    currentInputWidth !== targetWidth ||
    currentInputHeight !== targetHeight
  ) {
    console.warn(
      `Input tensor dimensions (${currentInputWidth}x${currentInputHeight}) do not match target ONNX dimensions (${targetWidth}x${targetHeight}). This should be handled by image preprocessing.`,
    );
    // For now, we'll proceed with the existing inputTensor, but this is where resizing would happen.
  }

  try {
    // if (simulateError) {
    //   throw new Error("Simulated memory/timeout error during ONNX inference.");
    // }
    const feeds = { "input.1": inputTensor }; // 'input.1' is the expected input name for U2-Net
    const results = await session.run(feeds);

    // Assuming the model has a single output, we'll use the first one identified: '1959'
    const output = results["1959"];
    if (!output) {
      throw new Error("ONNX inference output not found.");
    }
    return output as Tensor;
  } catch (error) {
    console.error("ONNX inference failed:", error);
    const currentResolutionIndex = [720, 540, 360].indexOf(processingResolution);
    if (currentResolutionIndex < 2) {
      // If not already at the lowest resolution (360p)
      const nextResolution = ([720, 540, 360] as ProcessingResolution[])[
        currentResolutionIndex + 1
      ];
      setProcessingResolution(nextResolution);
      console.warn(
        `Downgrading processing resolution to ${nextResolution} due to inference failure.`,
      );
    }
    // Fallback to low precision mask generation if inference fails even after downgrade attempts
    return generateLowPrecisionMask(targetWidth, targetHeight);
  }
}
