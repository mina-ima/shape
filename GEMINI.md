# GEMINI.md

## Project Overview

This project is a client-side web application that generates 2.5D parallax effect videos. The application takes an image from the user, automatically separates the foreground from the background, finds a suitable replacement background from an external API, and then creates a short animated video with a sense of depth.

The entire process, from image processing to video encoding, happens within the user's browser, ensuring user privacy as no images are uploaded to a server.

**Core Technologies:**

*   **Frontend Framework:** React with TypeScript, built with Vite.
*   **State Management:** Zustand.
*   **Machine Learning (for segmentation):** ONNX Runtime Web with a U²-Net model.
*   **Image Analysis (for similarity):** OpenCV.js for Canny edge detection, contour analysis, and shape descriptors (Hu Moments, Fourier Descriptors).
*   **Video Encoding:** A fallback system using WebCodecs, MediaRecorder API, and ffmpeg.wasm.
*   **Offline Capability:** Implemented as a Progressive Web App (PWA) using Workbox to cache assets and models.

## Building and Running

The project uses `pnpm` as the package manager.

*   **Install dependencies:**
    ```bash
    pnpm install
    ```
*   **Run the development server:**
    ```bash
    pnpm dev
    ```
*   **Build for production:**
    ```bash
    pnpm build
    ```
*   **Lint and format code:**
    ```bash
    pnpm lint
    ```
*   **Run type checking:**
    ```bash
    pnpm typecheck
    ```
*   **Run tests:**
    ```bash
    pnpm test
    ```

## Development Conventions

*   **Code Style:** The project enforces a consistent code style using ESLint and Prettier.
*   **Modularity:** The codebase is organized into modules by feature (e.g., `camera`, `segmentation`, `search`, `compose`).
*   **Path Aliases:** The `@/` alias is configured to point to the `src/` directory.
*   **Testing:** The project has a comprehensive testing strategy:
    *   **Unit Tests:** For individual functions and modules.
    *   **Integration Tests:** To verify that different parts of the application work together.
    *   **End-to-End (E2E) Tests:** Using Playwright to simulate user interactions and test critical user flows.
*   **Privacy:** A core principle is that user-generated images **must not** be sent to any external server. All processing is done on the client side.
*   **API Keys:** API keys for services like Unsplash/Pexels should not be hardcoded. They are expected to be provided at runtime.
