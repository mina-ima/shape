import { IDBPDatabase, openDB } from "idb";

interface VideoMetadata {
  filename: string;
  date: string;
  // 他のメタデータもここに追加
}

interface GalleryVideo {
  id?: number;

  video: Blob;

  metadata: VideoMetadata;
}

let db: IDBPDatabase | null = null;

const DB_NAME = "gallery-db";

const DB_VERSION = 1;

export async function openGalleryDB(
  dbName: string = DB_NAME,
  version: number = DB_VERSION,
): Promise<IDBPDatabase> {
  if (db) {
    return db;
  }

  db = await openDB(dbName, version, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("videos")) {
        const videoStore = database.createObjectStore("videos", {
          keyPath: "id",
          autoIncrement: true,
        });

        videoStore.createIndex("date", "metadata.date", { unique: false });
      }

      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata"); // 汎用メタデータ用
      }
    },
  });

  return db;
}

export function closeGalleryDB(): void {
  if (db) {
    db.close();

    db = null;
  }
}

export async function addVideoToGallery(
  video: Blob,
  metadata: VideoMetadata,
): Promise<IDBValidKey> {
  const database = await openGalleryDB();

  const tx = database.transaction("videos", "readwrite");

  const store = tx.objectStore("videos");

  const videoEntry: GalleryVideo = { video, metadata };

  const id = await store.add(videoEntry);

  await tx.done;

  return id;
}

export async function getVideosFromGallery(): Promise<GalleryVideo[]> {
  const database = await openGalleryDB();

  const tx = database.transaction("videos", "readonly");

  const store = tx.objectStore("videos");

  const videos = await store.getAll();

  await tx.done;

  return videos;
}
