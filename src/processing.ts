import {
  loadOnnxModel,
  runOnnxInference,
  getOnnxInputDimensions,
} from "./segmentation/model";
import { Tensor } from "onnxruntime-web";
import { getBackgroundImage } from "./search/search";
import { useStore } from "@/core/store";
import { calculateSimilarityScore } from "./similarity/score"; // Import calculateSimilarityScore

export const runProcessing = async (unsplashApiKey: string): Promise<void> => {
  // Ensure the ONNX model is loaded before inference
  await loadOnnxModel("/public/models/u2net.onnx");

  const { processingResolution } = useStore.getState(); // Get current processing resolution
  const [targetWidth, targetHeight] =
    getOnnxInputDimensions(processingResolution); // Get target ONNX dimensions

  // Simulate image preprocessing to create an input tensor
  // In a real app, this would come from the camera/file input and be resized here
  const inputShape = [1, 3, targetHeight, targetWidth]; // Use target dimensions
  console.log(
    `Target ONNX dimensions: ${targetWidth}x${targetHeight} for resolution ${processingResolution}`,
  );
  console.log(`Created inputShape: ${inputShape}`);
  const inputData = new Float32Array(inputShape.reduce((a, b) => a * b));
  const inputTensor = new Tensor("float32", inputData, inputShape);

  // Run ONNX inference
  performance.mark("start_segmentation");
  await runOnnxInference(inputTensor);
  performance.mark("end_segmentation");
  performance.measure(
    "segmentation_time",
    "start_segmentation",
    "end_segmentation",
  );
  const segmentationMeasure =
    performance.getEntriesByName("segmentation_time")[0];
  if (segmentationMeasure) {
    console.log(
      `Segmentation Time: ${segmentationMeasure.duration.toFixed(2)} ms`,
    );
  }

  // Simulate background image search using the provided API key
  console.log("Searching for background images...");
  const query = "cloud"; // Example query
  await getBackgroundImage(query, unsplashApiKey);

  // Simulate similarity scoring for 32 images
  console.log("Starting similarity scoring simulation...");
  performance.mark("start_similarity_scoring");
  const numCandidates = 32;
  for (let i = 0; i < numCandidates; i++) {
    console.log(
      `Simulating similarity scoring for candidate ${i + 1}/${numCandidates}...`,
    );
    try {
      const dummyImageData = new ImageData(1, 1);
      await calculateSimilarityScore(
        dummyImageData,
        dummyImageData,
        dummyImageData,
      ); // Simulate with dummy data
    } catch (scoreError) {
      console.error(
        `Error during similarity scoring for candidate ${i + 1}:`,
        scoreError,
      );
      throw scoreError; // Re-throw to propagate the error
    }
  }
  performance.mark("end_similarity_scoring");
  performance.measure(
    "similarity_scoring_time",
    "start_similarity_scoring",
    "end_similarity_scoring",
  );
  const scoringMeasure = performance.getEntriesByName(
    "similarity_scoring_time",
  )[0];
  if (scoringMeasure) {
    console.log(
      `Similarity Scoring Time for ${numCandidates} images: ${scoringMeasure.duration.toFixed(2)} ms`,
    );
  }
  console.log("Finished similarity scoring simulation.");

  // Simulate other processing steps (composition, encoding)
  console.log("Running actual processing steps...");
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async work
};
