import { test, expect } from "@playwright/test";

test.describe("Camera Permission Handling", () => {
  test("should fall back to gallery selection when camera permission is denied", async ({
    page,
    context,
  }) => {
    page.on("console", (msg) => console.log(`PAGE CONSOLE: ${msg.text()}`));

    // Mock navigator.mediaDevices.getUserMedia to throw a NotAllowedError before the page loads
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async (constraints) => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
        writable: true,
        configurable: true,
      });
    });

    await page.goto("http://localhost:4173/#unsplash_api_key=test-key");

    // Click the "処理を開始" button to trigger the process
    await page.getByRole("button", { name: "処理を開始" }).click();

    // Wait for UI to update after processing
    await page.waitForTimeout(100);

    // Expect an alert or a specific UI element indicating camera permission denied
    // and prompting for gallery selection.
    // You might need to adjust the selector based on your actual UI.
    await expect(page.getByTestId("error-message")).toHaveText(
      "権限がありません。写真を選択に切替えます",
    );

    // Optionally, you can click a button to proceed to gallery selection if your UI has one
    // await page.getByRole("button", { name: "ギャラリーから選択" }).click();

    // Further assertions can be added here to verify the gallery selection UI is active.
  });
});
