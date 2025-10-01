import cv from "@techstark/opencv-js";

export async function encodeWithWebCodecs(
  frames: cv.Mat[],
  fps: number,
  mimeType: string,
): Promise<Blob> {
  if (typeof window.VideoEncoder !== "function") {
    throw new Error("WebCodecs (VideoEncoder) is not available.");
  }

  if (frames.length === 0) {
    return new Blob([], { type: mimeType });
  }

  const width = frames[0].cols;
  const height = frames[0].rows;

  return new Promise<Blob>((resolve, reject) => {
    const encodedChunks: EncodedVideoChunk[] = [];

    const videoEncoder = new VideoEncoder({
      output: (chunk, _metadata) => {
        encodedChunks.push(chunk);
      },
      error: (e: unknown) => {
        console.error("WebCodecs encoding error:", e);
        reject(e);
      },
    });

    // Configure the encoder
    videoEncoder.configure({
      codec: mimeType === "video/webm" ? "vp8" : "avc1.42001E", // VP8 for WebM, H.264 for MP4
      width,
      height,
      bitrate: 10_000_000, // 10 Mbps
      framerate: fps,
    });

    (async () => {
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const timestamp = (i * 1_000_000) / fps; // Microseconds

        // Convert OpenCV Mat to VideoFrame
        // Assuming frame.data is in RGBA format (CV_8UC4)
        const rgbaData = new Uint8ClampedArray(frame.data);
        const videoFrame = new VideoFrame(rgbaData, {
          timestamp,
          codedWidth: width,
          codedHeight: height,
          format: "RGBA", // Specify format
        });

        videoEncoder.encode(videoFrame);
        videoFrame.close();
      }

      await videoEncoder.flush();
      videoEncoder.close();

      const blob = new Blob(
        encodedChunks.map((chunk) => chunk.data),
        { type: mimeType },
      );
      resolve(blob);
    })().catch(reject);
  });
}
