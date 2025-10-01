import { getMediaStream } from "./index";
import * as cameraModule from "./index";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the entire cameraModule to control selectImageFile
vi.mock("./index", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    selectImageFile: vi.fn(),
  };
});

describe("camera module", () => {
  let getUserMediaSpy: vi.SpyInstance;
  let createImageBitmapSpy: vi.SpyInstance;
  let createElementSpy: vi.SpyInstance;

  beforeEach(() => {
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

    it("should return undefined and log a warning if camera permission is denied", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      getUserMediaSpy.mockRejectedValue(
        new DOMException("Permission denied", "NotAllowedError"),
      );

      const stream = await getMediaStream(); // Await the result
      expect(stream).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Camera permission denied. Fallback to file selection should be handled by the caller.",
      );
      consoleWarnSpy.mockRestore();
    });

    it("should call selectImageFile if camera permission is denied", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      getUserMediaSpy.mockRejectedValue(
        new DOMException("Permission denied", "NotAllowedError"),
      );

      await getMediaStream(); // Await the result

      expect(cameraModule.selectImageFile).toHaveBeenCalledTimes(1);
      consoleWarnSpy.mockRestore();
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
      if (inputOnchangeHandler) {
        inputOnchangeHandler({ target: mockInput } as unknown as Event);
      }

      const result = await promise;
      expect(result).toBeUndefined();
      expect(inputClickSpy).toHaveBeenCalledTimes(1);
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
