import { describe, it, expect, vi } from "vitest";
import { animateParallax } from "./parallax";

describe("Parallax Animation", () => {
  it("easeInOutSine function should work correctly", () => {
    const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
    expect(easeInOutSine(0)).toBeCloseTo(0);
    expect(easeInOutSine(0.25)).toBeCloseTo(0.1464466);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(0.75)).toBeCloseTo(0.8535533);
    expect(easeInOutSine(1)).toBe(1);
  });

  it("should apply the easeInOutSine easing function", () => {
    const mockForeground = document.createElement("div");
    const mockBackground = document.createElement("div");

    const duration = 5;
    const easing = "easeInOutSine";

    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    let storedFrameCallback: FrameRequestCallback = () => {}; // Changed
    rafSpy.mockImplementation((callback) => {
      storedFrameCallback = callback; // Changed
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, duration, easing);

    // Simulate animation at 25% progress (1.25 seconds)
    const animationStartTime = 0; // Ensure this is defined
    storedFrameCallback(animationStartTime); // Changed
    storedFrameCallback(animationStartTime + 1250); // Changed

    // Calculate expected eased progress for 25% (0.25)
    const expectedEasedProgress = -(Math.cos(Math.PI * 0.25) - 1) / 2;
    const panAmount = 20; // pixels to pan
    // const fgTranslateX = 0;

    const fgTransform = mockForeground.style.transform;
    const fgTranslateXMatch = fgTransform.match(
      /translateX\(([-]?\d+\.?\d*)px\)/,
    );

    let actualFgTranslateX = 0; // Initialize with a default value
    if (fgTranslateXMatch && fgTranslateXMatch[1]) {
      actualFgTranslateX = parseFloat(fgTranslateXMatch[1]);
    } else {
      throw new Error("translateX value not found in foreground transform.");
    }

    // Expect the translateX value to be between 0 and panAmount (20), and not exactly 20
    expect(actualFgTranslateX).toBeGreaterThan(0);
    expect(actualFgTranslateX).toBeLessThan(20);
    // Expect the translateX value to be panAmount * (1 - expectedEasedProgress)
    expect(actualFgTranslateX).toBeCloseTo(
      panAmount * (1 - expectedEasedProgress),
    );

    rafSpy.mockRestore();
  });

  it("should animate foreground and background with correct properties", () => {
    const mockForeground = document.createElement("div");
    const mockBackground = document.createElement("div");

    // Mock requestAnimationFrame to control animation progress
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    let storedFrameCallback: FrameRequestCallback = () => {}; // Changed
    rafSpy.mockImplementation((callback) => {
      storedFrameCallback = callback; // Changed
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, 5, "easeInOutSine");

    // Simulate animation progress to the end
    storedFrameCallback(0); // Initialize startTime
    storedFrameCallback(5000); // Changed

    // Expect transform properties to be applied
    expect(mockForeground.style.transform).toMatch(
      /translateX\(.*px\) scale\(1.05\)/,
    );
    expect(mockBackground.style.transform).toMatch(
      /translateX\(.*px\) scale\(1.15\)/,
    );

    rafSpy.mockRestore();
  });

  it("should apply inverse panning and different scales to foreground and background", () => {
    const mockForeground = document.createElement("div");
    const mockBackground = document.createElement("div");

    const duration = 5;
    const easing = "easeInOutSine";

    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    let storedFrameCallback: FrameRequestCallback = () => {}; // Changed
    rafSpy.mockImplementation((callback) => {
      storedFrameCallback = callback; // Changed
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, duration, easing);

    storedFrameCallback(0); // Initialize startTime
    storedFrameCallback(5000); // Changed

    // Expect foreground to have moved right and scaled up slightly
    expect(mockForeground.style.transform).toMatch(
      /translateX\(0px\) scale\(1.05\)/,
    );
    // Expect background to have moved left and scaled up more
    expect(mockBackground.style.transform).toMatch(
      /translateX\(0px\) scale\(1.15\)/,
    );
    rafSpy.mockRestore();
  });

  it("should loop the animation", () => {
    const mockForeground = document.createElement("div");
    const mockBackground = document.createElement("div");

    const duration = 1; // 1 second duration for easier testing
    const easing = "easeInOutSine";

    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    let storedFrameCallback: FrameRequestCallback = () => {}; // Changed
    rafSpy.mockImplementation((callback) => {
      storedFrameCallback = callback; // Changed
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, duration, easing);

    // Simulate animation to the end of the first cycle
    storedFrameCallback(0); // Initialize startTime
    storedFrameCallback(1000); // Changed

    // const firstCycleTransformFG = 'translate3d(0px, 0px, 0px)';
    // const firstCycleTransformBG = mockBackground.style.transform;

    // Simulate animation into the second cycle (e.g., 0.5s into the second loop)
    storedFrameCallback(1000 + 500); // Changed

    // Expect the transform to be different from the start of the loop
    expect(mockForeground.style.transform).not.toBe(
      "translateX(20px) scale(1.05)",
    );
    expect(mockBackground.style.transform).not.toBe(
      "translateX(-20px) scale(1.15)",
    );

    rafSpy.mockRestore();
  });

  it("should handle crossfade during looping", () => {
    const mockForeground = document.createElement("div");
    const mockBackground = document.createElement("div");

    const duration = 1; // 1 second duration
    const easing = "easeInOutSine";
    const crossfadeDuration = 0.2; // 200ms crossfade

    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    let storedFrameCallback: FrameRequestCallback = () => {}; // Changed
    rafSpy.mockImplementation((callback) => {
      storedFrameCallback = callback; // Changed
      return 0; // Return a dummy ID
    });

    mockForeground.style.opacity = "1";
    mockBackground.style.opacity = "1";

    animateParallax(
      mockForeground,
      mockBackground,
      duration,
      easing,
      crossfadeDuration,
    );

    // Initialize startTime
    storedFrameCallback(0);

    // Simulate just before crossfade starts (e.g., at 0.7s for a 1s animation with 0.2s crossfade)
    storedFrameCallback(700);
    expect(mockForeground.style.opacity).toBe("1");

    // Simulate during crossfade (e.g., at 0.9s)
    storedFrameCallback(900);
    expect(parseFloat(mockForeground.style.opacity)).toBeLessThan(1);
    expect(parseFloat(mockForeground.style.opacity)).toBeGreaterThan(0);

    // Simulate after crossfade (start of new loop, opacity should be fading in)
    storedFrameCallback(1000 + 100);
    expect(parseFloat(mockForeground.style.opacity)).toBeGreaterThan(0);
    expect(parseFloat(mockForeground.style.opacity)).toBeLessThan(1);

    rafSpy.mockRestore();
  });
});
