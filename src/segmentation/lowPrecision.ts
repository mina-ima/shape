import { Tensor } from "onnxruntime-web";

export function generateLowPrecisionMask(
  width: number,
  height: number,
): Tensor {
  console.warn("Low precision mode active: Generating a placeholder mask.");
  // For simplicity, return a solid white mask (all foreground)
  const size = width * height;
  const data = new Float32Array(size).fill(1);
  return new Tensor("float32", data, [1, 1, height, width]);
}
