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
});
