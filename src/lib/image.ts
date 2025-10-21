export async function imageBitmapToUint8Array(imageBitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context from canvas.");
  }
  ctx.drawImage(imageBitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
  return new Uint8Array(imageData.data); // Uint8ClampedArray を Uint8Array に変換
}

export function createSolidColorImageBitmap(width: number, height: number, color: string = "#000000"): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context from canvas.");
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return createImageBitmap(canvas);
}
