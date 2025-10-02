import { loadOnnxModel, runOnnxInference, getOnnxInputDimensions } from "./segmentation/model";
import { Tensor } from "onnxruntime-web";
import { getBackgroundImage } from "./search/search";
import { useStore } from "@/core/store";

export const runProcessing = async (unsplashApiKey: string): Promise<void> => {
  // Ensure the ONNX model is loaded before inference
  await loadOnnxModel("/public/models/u2net.onnx");

  const { processingResolution } = useStore.getState(); // Get current processing resolution
  const [targetWidth, targetHeight] = getOnnxInputDimensions(processingResolution); // Get target ONNX dimensions
  console.log(`Target ONNX dimensions: ${targetWidth}x${targetHeight} for resolution ${processingResolution}`);

  // Simulate image preprocessing to create an input tensor
  // In a real app, this would come from the camera/file input and be resized here
  const inputShape = [1, 3, targetHeight, targetWidth]; // Use target dimensions
  console.log(`Created inputShape: ${inputShape}`);
  const inputData = new Float32Array(inputShape.reduce((a, b) => a * b));
  const inputTensor = new Tensor("float32", inputData, inputShape);

  // Run ONNX inference
  await runOnnxInference(inputTensor);

  // Simulate background image search using the provided API key
  console.log("Searching for background images...");
  const query = "cloud"; // Example query
  await getBackgroundImage(query, unsplashApiKey);

  // Simulate other processing steps (composition, encoding)
  console.log("Running actual processing steps...");
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async work
};
