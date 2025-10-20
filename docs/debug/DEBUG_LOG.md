# Debugging Log

## Session: 2025年10月20日

### Issue: `Tabs` component accessibility tests are failing.

- **File:** `src/ui/Tabs.test.tsx`
- **Test:** `Tabs > associates tabs with panels using ARIA attributes`
- **Error:** `expect(element).toHaveAttribute("aria-controls", "") ... Received: null`

### Analysis

The test fails because the `button` element with `role="tab"` is missing the `aria-controls` attribute. This indicates a lack of accessibility implementation for associating the tab control with its corresponding tab panel. The current implementation does not generate the necessary IDs to link them.

---

### Update: Post-Fix Test Failure

- **New Error:** `expect(element).toHaveAttribute("aria-controls", "")` but received a dynamic ID like `aria-controls="«r1»-panel-0"`.
- **New Analysis:** The component was correctly modified to use `useId` and add the appropriate ARIA attributes. However, the test itself was brittle. It was trying to directly compare the `aria-controls` value with the `id` of a panel element found via a fragile selector (`.parentElement`). This fails because the selector was incorrect and comparing dynamic IDs directly is not a robust testing strategy.

---

### Update: Typecheck and Lint Errors

- **Type Error:** `src/ui/Tabs.tsx:62:17 - error TS2322: Type 'HTMLElement | null | undefined' is not assignable to type 'HTMLElement | null'.`
  - **Analysis:** The expression `e.currentTarget.parentElement?.querySelector(...)` can result in `undefined` if `parentElement` is null, which is not assignable to the `newTab` variable typed as `HTMLElement | null`.
- **Lint Warnings:** Unused `eslint-disable` directives found in `src/compose/parallax.ts` and `src/lib/cv.ts`.
  - **Analysis:** These are leftover comments that are no longer needed and should be removed for code cleanliness.

---

### Update: Test Suite Failures

- **Error:** `TypeError: Method Promise.prototype.then called on incompatible receiver [object Module]`
- **Failing Files:** `src/segmentation/onnx.test.ts`, `src/similarity/ranking.test.ts`, `src/similarity/score.test.ts`
- **Analysis:** This error points to an issue with how an async module, likely the `@/lib/cv` mock, is being handled in the tests. The module is being treated as both a standard module object and a Promise, causing the `this` context for `.then()` to be incorrect. This is a common issue with `vi.mock` and async modules.

---

### Update: `src/similarity/score.test.ts` `ReferenceError`

- **Error:** `ReferenceError: cvModule is not defined`
- **File:** `src/similarity/score.test.ts`
- **Line:** `const cv: any = (cvModule as any).default ?? cvModule;`
- **Analysis:** The `cvModule` variable was not defined in the scope. This line was likely copied from a different context. The `getCV` function from `@/lib/cv` already returns the mock `cv` object, so this intermediate variable is unnecessary and causes a `ReferenceError`.
