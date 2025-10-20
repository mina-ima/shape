# Debugging Plan

## Objective: Fix the `Tabs` component to pass accessibility tests.

### Initial Plan (Completed)

1.  **Modify `src/ui/Tabs.tsx`:** Read the current implementation.
2.  **Generate Unique IDs:** Use a hook like `React.useId` or a simple index-based approach to create unique IDs for each tab and its corresponding panel.
3.  **Add ARIA Attributes to Tab Buttons:**
    - Add the `id` attribute to the `<button role="tab">`.
    - Add the `aria-controls` attribute, setting its value to the ID of the corresponding panel.
4.  **Add ARIA Attributes to Tab Panels:**
    - Add the `id` attribute to the `<div role="tabpanel">`.
    - Add the `aria-labelledby` attribute, setting its value to the ID of the corresponding tab button.
5.  **Verify:** Run `pnpm test src/ui/Tabs.test.tsx` to confirm that all tests pass.

---

### Revised Plan (Completed)

**Objective:** Make the test for ARIA associations in `Tabs.test.tsx` robust and independent of dynamically generated IDs.

1.  **Modify `src/ui/Tabs.test.tsx`:** Read the current test implementation.
2.  **Refactor the Failing Test (`associates tabs with panels using ARIA attributes`):**
    - Instead of comparing IDs directly, verify the _relationship_.
    - Get the `tab` element (e.g., `screen.getByRole("tab", { name: "Tab 1" })`).
    - Get the value of its `aria-controls` attribute.
    - Assert that this value is not null or empty.
    - Use this value as an ID to find the corresponding `panel` element (e.g., `document.getElementById(...)`).
    - Assert that this panel element exists and contains the correct content (e.g., `toHaveTextContent("Content 1")`).
    - Also, get the panel's `aria-labelledby` attribute and verify it matches the tab's `id`.
3.  **Verify:** Run `pnpm test src/ui/Tabs.test.tsx` to confirm that all tests pass.

---

### Final Plan (Completed)

**Objective:** Resolve TypeScript and ESLint errors to pass all static analysis checks.

1.  **Fix TypeScript Error in `src/ui/Tabs.tsx`:**
    - Locate the line `newTab = e.currentTarget.parentElement?.querySelector(...)`.
    - Append `?? null` to the expression to ensure the result is `HTMLElement | null`, satisfying the type checker.
    - The corrected line will be `newTab = e.currentTarget.parentElement?.querySelector(...) ?? null;`.
2.  **Fix ESLint Warnings:**
    - Read `src/compose/parallax.ts` and remove the unused `eslint-disable` comment.
    - Read `src/lib/cv.ts` and remove the unused `eslint-disable` comment.
3.  **Final Verification:**
    - Run the full command `pnpm format && pnpm lint && pnpm typecheck && pnpm test` to ensure all checks pass without any errors or warnings.

---

### Test Suite Debug Plan (Completed)

**Objective:** Fix the `TypeError: Method Promise.prototype.then called on incompatible receiver [object Module]` error in the test suite.

1.  **Investigate:**
    - Read the failing test file `src/similarity/ranking.test.ts` and the source file `src/similarity/ranking.ts`.
    - Analyze how the `@/lib/cv` module is imported, mocked (`vi.mock`), and used. The problem likely lies in the mock's structure, where the module itself is being treated as a Promise.
2.  **Hypothesize Fix:** The mock for `@/lib/cv` needs to be adjusted. Instead of the module itself being promise-like, the mock should export a `default` function (`getCV`) that returns a Promise resolving to the mock `cv` object. This aligns with the actual module's structure.
3.  **Implement Fix:**
    - Modify the `vi.mock` call in `src/similarity/ranking.test.ts`. The mock should be structured as `{ default: vi.fn().mockResolvedValue(mockCvObject) }`.
    - Apply the same fix to the other failing test files: `src/segmentation/onnx.test.ts` and `src/similarity/score.test.ts`.
4.  **Verify:**
    - Run `pnpm test` to confirm that all 100 tests now pass.

---

### `src/similarity/score.test.ts` `ReferenceError` Fix Plan (Current)

**Objective:** Resolve `ReferenceError: cvModule is not defined` in `src/similarity/score.test.ts`.

1.  **Modify `src/similarity/score.test.ts`:**
    - Remove the line `const cv: any = (cvModule as any).default ?? cvModule;`.
    - In the test `Serial Similarity Scoring Performance > should take more than 400ms to score 32 images serially`, ensure that `getCV()` is `await`ed to obtain the mock `cv` object before use.
2.  **Verify:**
    - Run `pnpm test src/similarity/score.test.ts` to confirm that the test now passes.
