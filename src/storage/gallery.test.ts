import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  openGalleryDB,
  closeGalleryDB,
  addVideoToGallery,
  getVideosFromGallery,
} from "./gallery";

const DB_NAME = "test-gallery-db";
const DB_VERSION = 1;

describe("Gallery IndexedDB Schema", () => {
  beforeEach(async () => {
    // IndexedDBをクリア
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // エラー時も続行
    });
  });

  afterEach(async () => {
    // テスト後にDBを閉じる
    closeGalleryDB();
    // IndexedDBをクリア
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // エラー時も続行
    });
  });

  it("should open and create the gallery database with the correct schema", async () => {
    const db = await openGalleryDB(DB_NAME, DB_VERSION);
    expect(db).toBeDefined();
    expect(db.objectStoreNames.contains("videos")).toBe(true);
    expect(db.objectStoreNames.contains("metadata")).toBe(true);
    db.close();
  });

  it("should add a video to the gallery", async () => {
    const db = await openGalleryDB(DB_NAME, DB_VERSION);
    const mockVideo = new Blob(["video data"], { type: "video/webm" });
    const mockMetadata = {
      filename: "test.webm",
      date: new Date().toISOString(),
    };

    await addVideoToGallery(mockVideo, mockMetadata);

    const videos = await getVideosFromGallery();
    expect(videos.length).toBe(1);
    expect(videos[0].metadata.filename).toBe(mockMetadata.filename);
    expect(videos[0].metadata.date).toBe(mockMetadata.date);
    expect(videos[0].video).toBeDefined();
    db.close();
  });

  it("should retrieve videos from the gallery", async () => {
    const db = await openGalleryDB(DB_NAME, DB_VERSION);
    const mockVideo1 = new Blob(["video data 1"], { type: "video/webm" });
    const mockMetadata1 = {
      filename: "test1.webm",
      date: new Date().toISOString(),
    };
    const mockVideo2 = new Blob(["video data 2"], { type: "video/mp4" });
    const mockMetadata2 = {
      filename: "test2.mp4",
      date: new Date().toISOString(),
    };

    await addVideoToGallery(mockVideo1, mockMetadata1);
    await addVideoToGallery(mockVideo2, mockMetadata2);

    const videos = await getVideosFromGallery();
    expect(videos.length).toBe(2);
    expect(videos[0].metadata.filename).toBe(mockMetadata1.filename);
    expect(videos[1].metadata.filename).toBe(mockMetadata2.filename);
    expect(videos[0].video).toBeDefined();
    expect(videos[1].video).toBeDefined();
    db.close();
  });
});
