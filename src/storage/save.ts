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
