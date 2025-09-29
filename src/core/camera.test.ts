import { describe, it, expect } from "vitest";
import { camera } from "@/camera";

describe("Camera module", () => {
  it("should not have getMediaStream function yet", () => {
    // @ts-expect-error: getMediaStream does not exist yet
    expect(camera.getMediaStream).toBeDefined();
  });

  it("should not have selectImageFile function yet", () => {
    // @ts-expect-error: selectImageFile does not exist yet
    expect(camera.selectImageFile).toBeDefined();
  });
});
