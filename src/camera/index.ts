export class CameraPermissionDeniedError extends Error {
  constructor(message = "Camera permission denied") {
    super(message);
    this.name = "CameraPermissionDeniedError";
  }
}

export const getMediaStream = async (): Promise<MediaStream> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    return stream;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      console.log(
        "Camera permission denied, throwing CameraPermissionDeniedError.",
      );
      throw new CameraPermissionDeniedError(
        "Camera permission was denied by the user.",
      );
    } else {
      console.error("Error accessing camera:", error);
      throw error; // Re-throw other errors
    }
  }
};

export const selectImageFile = (): Promise<ImageBitmap | undefined> => {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const imageBitmap = await createImageBitmap(file);
          resolve(imageBitmap);
        } catch (error) {
          console.error("Error creating ImageBitmap:", error);
          resolve(undefined);
        }
      } else {
        resolve(undefined);
      }
    };
    input.click();
  });
};

const MAX_LONG_SIDE = 1440;

export const processImage = async (
  imageBitmap: ImageBitmap,
): Promise<ImageBitmap> => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  let { width, height } = imageBitmap;
  const rotation = 0;
  const scaleX = 1;
  const scaleY = 1;

  // TODO: EXIF orientation correction (requires external library or manual parsing)
  // For now, assume orientation is correct or handled by createImageBitmap

  // Resize if necessary
  if (Math.max(width, height) > MAX_LONG_SIDE) {
    if (width > height) {
      height = Math.round(height * (MAX_LONG_SIDE / width));
      width = MAX_LONG_SIDE;
    } else {
      width = Math.round(width * (MAX_LONG_SIDE / height));
      height = MAX_LONG_SIDE;
    }
  }

  canvas.width = width;
  canvas.height = height;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotation);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(imageBitmap, -width / 2, -height / 2, width, height);
  ctx.restore();

  const processedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!processedBlob) {
    throw new Error("Failed to create processed image blob");
  }

  return createImageBitmap(processedBlob);
};

export const getCameraInput = async (): Promise<ImageBitmap | undefined> => {
  let imageBitmap: ImageBitmap | undefined;
  let stream: MediaStream | undefined;

  try {
    stream = await getMediaStream();
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context for camera stream");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    imageBitmap = await createImageBitmap(canvas);
  } catch (error) {
    if (error instanceof CameraPermissionDeniedError) {
      console.log("Camera permission denied, falling back to file selection.");
      imageBitmap = await selectImageFile();
    } else {
      console.error("Error with camera stream:", error);
      // Re-throw if it's not a permission error and not handled by fallback
      throw error;
    }
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  if (imageBitmap) {
    return processImage(imageBitmap);
  }
  return undefined;
};
