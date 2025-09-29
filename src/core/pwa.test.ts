import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA setup", () => {
  it("should not have vite-plugin-pwa installed yet", () => {
    const packageJsonPath = path.resolve(__dirname, "../../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    const hasVitePluginPwa =
      (packageJson.dependencies &&
        packageJson.dependencies["vite-plugin-pwa"]) ||
      (packageJson.devDependencies &&
        packageJson.devDependencies["vite-plugin-pwa"]);

    expect(hasVitePluginPwa).toBeTruthy();
  });

  it("should not have VitePWA plugin configured in vite.config.ts yet", () => {
    const viteConfigPath = path.resolve(__dirname, "../../vite.config.ts");
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
    expect(viteConfigContent).toContain("VitePWA");
  });
});
