import { getMediaStream } from "./index";
import * as cameraModule from "./index";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("camera module", () => {
  let getUserMediaSpy: vi.SpyInstance;
  let createImageBitmapSpy: vi.SpyInstance;
  let createElementSpy: vi.SpyInstance;

  beforeEach(() => {
    // Mock navigator.mediaDevices as it might not exist in the test environment
    if (!navigator.mediaDevices) {
      // @ts-expect-error - Mocking read-only property
      navigator.mediaDevices = { getUserMedia: vi.fn() };
    } else if (!navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia = vi.fn();
    }
    getUserMediaSpy = vi.spyOn(navigator.mediaDevices, "getUserMedia");
    createImageBitmapSpy = vi.spyOn(globalThis, "createImageBitmap");
    createElementSpy = vi.spyOn(document, "createElement");

    createElementSpy.mockImplementation(((tagName: string) => {
      if (tagName === "input") {
        // This mock will be overridden in selectImageFile describe block
        return { click: vi.fn() } as unknown as HTMLInputElement;
      }
      return document.createElement(tagName);
    }) as (tagName: string, options?: ElementCreationOptions) => HTMLElement);
  });

  afterEach(() => {
    getUserMediaSpy.mockRestore();
    createImageBitmapSpy.mockRestore();
    createElementSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe("getMediaStream", () => {
    it("should return a MediaStream if camera permission is granted", async () => {
      const mockStream = {} as MediaStream;
      getUserMediaSpy.mockResolvedValue(mockStream);

      const stream = await getMediaStream();
      expect(stream).toBe(mockStream);
      expect(getUserMediaSpy).toHaveBeenCalledWith({
        video: true,
      });
    });

    it("should throw CameraPermissionDeniedError if camera permission is denied", async () => {
      getUserMediaSpy.mockRejectedValueOnce(
        new DOMException("Permission denied", "NotAllowedError"),
      );

      await expect(getMediaStream()).rejects.toThrow(
        cameraModule.CameraPermissionDeniedError,
      );
      expect(getUserMediaSpy).toHaveBeenCalledWith({ video: true });
    });
  });

  describe("selectImageFile", () => {
    let mockFileList: FileList;
    let mockInput: HTMLInputElement;
    let inputClickSpy: vi.SpyInstance;
    let inputOnchangeHandler: ((event: Event) => void) | null;

    beforeEach(() => {
      inputOnchangeHandler = null;
      mockFileList = { length: 0, item: () => null } as unknown as FileList;
      mockInput = {
        type: "file",
        accept: "image/*",
        set onchange(handler: ((event: Event) => void) | null) {
          inputOnchangeHandler = handler;
        },
        get onchange() {
          return inputOnchangeHandler;
        },
        click: vi.fn(),
        get files() {
          return mockFileList;
        },
      } as unknown as HTMLInputElement;

      createElementSpy.mockImplementation(((tagName: string) => {
        if (tagName === "input") {
          return mockInput;
        }
        return document.createElement(tagName);
      }) as (tagName: string, options?: ElementCreationOptions) => HTMLElement);
      inputClickSpy = vi.spyOn(mockInput, "click");
    });

    afterEach(() => {
      inputClickSpy.mockRestore();
    });

    it("should return an ImageBitmap when a file is selected", async () => {
      const mockImageBitmap = {} as ImageBitmap;
      createImageBitmapSpy.mockResolvedValue(mockImageBitmap); // ここでモックを設定
      const mockFile = new File([""], "test.png", { type: "image/png" });

      const promise = cameraModule.selectImageFile();

      // Simulate file selection
      const mockFiles: { [index: number]: File | undefined } & {
        length: number;
        item: (index: number) => File | null;
      } = {
        0: mockFile,
        length: 1,
        item: (index: number) => mockFiles[index] || null,
      };
      mockFileList = mockFiles as FileList;

      if (inputOnchangeHandler) {
        inputOnchangeHandler({ target: mockInput } as unknown as Event);
      }

      const result = await promise;
      expect(result).toEqual(mockImageBitmap);
      expect(createImageBitmapSpy).toHaveBeenCalledWith(mockFile);
      expect(inputClickSpy).toHaveBeenCalledTimes(1);
    });

    it("should return undefined if no file is selected", async () => {
      const promise = cameraModule.selectImageFile();

      // Simulate no file selection (mockFileList remains empty)
      expect(inputClickSpy).toHaveBeenCalledTimes(1); // ここを追加

      if (inputOnchangeHandler) {
        inputOnchangeHandler({ target: mockInput } as unknown as Event);
      }

      const result = await promise;
      expect(result).toBeUndefined();
    });

    it("should return undefined and log an error if createImageBitmap fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      createImageBitmapSpy.mockRejectedValue(
        new Error("Failed to create bitmap"),
      );

      const mockFile = new File([""], "test.png", { type: "image/png" });

      const promise = cameraModule.selectImageFile();

      // Simulate file selection
      const mockFiles: { [index: number]: File | undefined } & {
        length: number;
        item: (index: number) => File | null;
      } = {
        0: mockFile,
        length: 1,
        item: (index: number) => mockFiles[index] || null,
      };
      mockFileList = mockFiles as FileList;

      if (inputOnchangeHandler) {
        inputOnchangeHandler({ target: mockInput } as unknown as Event);
      }

      const result = await promise;
      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating ImageBitmap:",
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
      expect(inputClickSpy).toHaveBeenCalledTimes(1);
    });
  });
});
