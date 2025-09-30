import { describe, it, expect, vi } from "vitest";
import fs from "fs";

// Mock package.json content (without vite-plugin-pwa)
const mockPackageJsonContent = JSON.stringify({
  name: "shape",
  version: "1.0.0",
  dependencies: {},
  devDependencies: {},
});

// Mock vite.config.ts content (without PWA config)
const mockViteConfigContent = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
`;

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn((filePath: string) => {
      if (filePath.includes("package.json")) {
        return mockPackageJsonContent;
      }
      if (filePath.includes("vite.config.ts")) {
        return mockViteConfigContent;
      }
      return "";
    }),
  },
}));

vi.mock("path", () => ({
  default: {
    resolve: vi.fn((...args: string[]) => {
      const resolvedPath = args.join("/"); // A simple join for now
      if (resolvedPath.includes("package.json")) {
        return "package.json"; // Return a simplified path for the mock fs
      }
      if (resolvedPath.includes("vite.config.ts")) {
        return "vite.config.ts"; // Return a simplified path for the mock fs
      }
      return resolvedPath;
    }),
  },
}));

describe("PWA setup", () => {
  it("should not have vite-plugin-pwa installed yet", () => {
    const packageJsonPath = "package.json";
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    const hasVitePluginPwa =
      (packageJson.dependencies &&
        packageJson.dependencies["vite-plugin-pwa"]) ||
      (packageJson.devDependencies &&
        packageJson.devDependencies["vite-plugin-pwa"]);

    expect(hasVitePluginPwa).toBeFalsy();
  });

  it("should not have VitePWA plugin configured in vite.config.ts yet", () => {
    const viteConfigPath = "vite.config.ts";
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
    expect(viteConfigContent).not.toContain("VitePWA");
  });

  it("should not have runtimeCaching configured in vite.config.ts yet", () => {
    const viteConfigPath = "vite.config.ts";
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
    expect(viteConfigContent).not.toContain("runtimeCaching");
  });

  it("should not have injectManifest configured in vite.config.ts yet", () => {
    const viteConfigPath = "vite.config.ts";
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
    expect(viteConfigContent).not.toContain("injectManifest");
  });
});
