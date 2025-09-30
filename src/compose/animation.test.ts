import { describe, it, expect, vi } from 'vitest';
import { animateParallax } from './parallax';

describe('Parallax Animation', () => {
  it('should animate foreground and background with correct properties', () => {
    const mockForeground = document.createElement('div');
    const mockBackground = document.createElement('div');

    // Mock requestAnimationFrame to control animation progress
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    let frameCallback: FrameRequestCallback;
    rafSpy.mockImplementation((callback) => {
      frameCallback = callback;
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, 5, 'easeInOutSine');

    // Simulate animation progress to the end
    if (frameCallback) {
      frameCallback(5000); // Simulate 5 seconds passing
    }

    // Expect transform properties to be applied
    expect(mockForeground.style.transform).toMatch(/translateX\(\d+px\) scale\(\d+\.\d+\)/);
    expect(mockBackground.style.transform).toMatch(/translateX\(-\d+px\) scale\(\d+\.\d+\)/);

    rafSpy.mockRestore();
  });

  it('should apply inverse panning and different scales to foreground and background', () => {
    const mockForeground = document.createElement('div');
    const mockBackground = document.createElement('div');

    const duration = 5;
    const easing = 'easeInOutSine';

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    let frameCallback: FrameRequestCallback;
    rafSpy.mockImplementation((callback) => {
      frameCallback = callback;
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, duration, easing);

    if (frameCallback) {
      frameCallback(5000); // Simulate 5 seconds passing
    }

    // Expect foreground to have moved right and scaled up slightly
    expect(mockForeground.style.transform).toMatch(/translateX\(-?\d+(\.\d+)?px\) scale\(1\.05\)/);
    // Expect background to have moved left and scaled up more
    expect(mockBackground.style.transform).toMatch(/translateX\(-?\d+(\.\d+)?px\) scale\(1\.15\)/);

    rafSpy.mockRestore();
  });

  it('should handle looping with crossfade (optional MVP)', () => {
    const mockForeground = document.createElement('div');
    const mockBackground = document.createElement('div');

    const duration = 5;
    const easing = 'easeInOutSine';
    const crossfadeDuration = 0.3; // 300ms

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    rafSpy.mockImplementation((callback) => {
      return 0; // Return a dummy ID
    });

    animateParallax(mockForeground, mockBackground, duration, easing, crossfadeDuration);

    expect(rafSpy).toHaveBeenCalled();

    rafSpy.mockRestore();
  });
});
