import { InferenceSession, Tensor } from 'onnxruntime-web';

let session: InferenceSession | null = null;

export async function loadOnnxModel(modelPath: string): Promise<void> {
  try {
    session = await InferenceSession.create(modelPath);
    console.log('ONNX model loaded successfully.');
  } catch (e) {
    console.error('Failed to load ONNX model:', e);
    throw e;
  }
}

export async function runOnnxInference(inputTensor: Tensor): Promise<Tensor> {
  if (!session) {
    throw new Error('ONNX session not loaded. Call loadOnnxModel first.');
  }

  const feeds = { 'input.1': inputTensor }; // 'input.1' is the expected input name for U2-Net
  const results = await session.run(feeds);

  // Assuming the model has a single output, we'll use the first one identified: '1959'
  const output = results['1959'];
  if (!output) {
    throw new Error('ONNX inference output not found.');
  }
  return output as Tensor;
}
