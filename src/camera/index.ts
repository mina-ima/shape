export const getMediaStream = async (): Promise<MediaStream | undefined> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    return stream;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      console.warn("Camera permission denied.");
      return undefined;
    } else {
      console.error("Error accessing camera:", error);
      return undefined;
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

export const camera = {};
