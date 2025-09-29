export const getMediaStream = async (): Promise<MediaStream | undefined> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    return stream;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      console.warn("Camera permission denied.");
      // 拒否時に自動でギャラリー選択へ、という要件はUI層でハンドリングするため、ここではundefinedを返す
      return undefined;
    } else {
      console.error("Error accessing camera:", error);
      return undefined;
    }
  }
};

export const camera = {};
