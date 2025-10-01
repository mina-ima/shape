export type MimeType = "video/webm" | "video/mp4";

export function generateFilename(mimeType: MimeType): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  const ext = mimeType === "video/webm" ? "webm" : "mp4";

  return `parallax_${year}${month}${day}_${hours}${minutes}${seconds}.${ext}`;
}

async function saveWithPicker(blob: Blob, mimeType: MimeType): Promise<void> {
  if (!window.showSaveFilePicker) {
    throw new Error("showSaveFilePicker is not available");
  }
  const filename = generateFilename(mimeType);
  const handle = await window.showSaveFilePicker({
    suggestedName: filename,
  });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function saveWithLink(blob: Blob, mimeType: MimeType): void {
  const filename = generateFilename(mimeType);
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function saveFile(
  blob: Blob,
  preferredMimeType: MimeType,
): Promise<void> {
  if (!window.showSaveFilePicker) {
    // If the API is not available at all, use the legacy method immediately.
    saveWithLink(blob, preferredMimeType);
    return;
  }

  const alternativeMimeType: MimeType =
    preferredMimeType === "video/webm" ? "video/mp4" : "video/webm";

  try {
    // 1. Try saving with the preferred MIME type
    await saveWithPicker(blob, preferredMimeType);
  } catch (err) {
    // Ignore AbortError which means the user cancelled the dialog
    if (err instanceof DOMException && err.name === "AbortError") {
      console.log("File save dialog cancelled by user.");
      return;
    }

    console.warn(
      `Saving with ${preferredMimeType} failed. Retrying with ${alternativeMimeType}.`,
      err,
    );

    try {
      // 2. Try saving with the alternative MIME type
      await saveWithPicker(blob, alternativeMimeType);
    } catch (err2) {
      if (err2 instanceof DOMException && err2.name === "AbortError") {
        console.log("File save dialog cancelled by user on retry.");
        return;
      }
      console.error(
        `Saving with ${alternativeMimeType} also failed. Falling back to <a> download.`,
        err2,
      );
      // 3. Fallback to legacy <a> download method
      saveWithLink(blob, preferredMimeType);
    }
  }
}
