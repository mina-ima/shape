export function generateFilename(mimeType: "video/webm" | "video/mp4"): string {
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

export async function saveFile(blob: Blob, filename: string): Promise<void> {
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      throw new Error("showSaveFilePicker is not available");
    }
  } catch (err) {
    console.warn(
      "showSaveFilePicker failed, falling back to <a> download.",
      err,
    );
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
