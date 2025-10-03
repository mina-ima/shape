import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Tabs from "./Tabs";

const userEvent = await import("@testing-library/user-event");

describe("Tabs", () => {
  it("renders tabs with correct titles", () => {
    render(
      <Tabs>
        <div title="年齢・和暦">Content 1</div>
        <div title="勤続年数">Content 2</div>
        <div title="定年まで">Content 3</div>
        <div title="退職所得">Content 4</div>
      </Tabs>,
    );

    expect(screen.getByRole("tab", { name: "年齢・和暦" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "勤続年数" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "定年まで" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "退職所得" })).toBeInTheDocument();
  });

  it("navigates tabs with arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <Tabs>
        <div title="Tab 1">Content 1</div>
        <div title="Tab 2">Content 2</div>
        <div title="Tab 3">Content 3</div>
      </Tabs>,
    );

    const tab1 = screen.getByRole("tab", { name: "Tab 1" });
    const tab2 = screen.getByRole("tab", { name: "Tab 2" });
    const tab3 = screen.getByRole("tab", { name: "Tab 3" });

    // Initial state: Tab 1 is selected
    expect(tab1).toHaveAttribute("aria-selected", "true");
    expect(tab2).toHaveAttribute("aria-selected", "false");

    // Move right to Tab 2
    tab1.focus();
    await user.keyboard("{ArrowRight}");
    expect(tab1).toHaveAttribute("aria-selected", "false");
    expect(tab2).toHaveAttribute("aria-selected", "true");

    // Move right to Tab 3
    await user.keyboard("{ArrowRight}");
    expect(tab2).toHaveAttribute("aria-selected", "false");
    expect(tab3).toHaveAttribute("aria-selected", "true");

    // Move right from Tab 3 (should wrap to Tab 1)
    await user.keyboard("{ArrowRight}");
    expect(tab3).toHaveAttribute("aria-selected", "false");
    expect(tab1).toHaveAttribute("aria-selected", "true");

    // Move left to Tab 3
    await user.keyboard("{ArrowLeft}");
    expect(tab1).toHaveAttribute("aria-selected", "false");
    expect(tab3).toHaveAttribute("aria-selected", "true");

    // Move left to Tab 2
    await user.keyboard("{ArrowLeft}");
    expect(tab3).toHaveAttribute("aria-selected", "false");
    expect(tab2).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to first/last tab with Home/End keys", async () => {
    const user = userEvent.setup();
    render(
      <Tabs>
        <div title="First Tab">Content 1</div>
        <div title="Middle Tab">Content 2</div>
        <div title="Last Tab">Content 3</div>
      </Tabs>,
    );

    const firstTab = screen.getByRole("tab", { name: "First Tab" });
    const lastTab = screen.getByRole("tab", { name: "Last Tab" });

    // Initial state: First Tab is selected
    expect(firstTab).toHaveAttribute("aria-selected", "true");

    // Move to Last Tab with End key
    firstTab.focus();
    await user.keyboard("{End}");
    expect(firstTab).toHaveAttribute("aria-selected", "false");
    expect(lastTab).toHaveAttribute("aria-selected", "true");

    // Move to First Tab with Home key
    await user.keyboard("{Home}");
    expect(lastTab).toHaveAttribute("aria-selected", "false");
    expect(firstTab).toHaveAttribute("aria-selected", "true");
  });
});
