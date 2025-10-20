import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Tabs from "./Tabs";

describe("Tabs", () => {
  const TestTabs = () => (
    <Tabs>
      <div title="Tab 1">Content 1</div>
      <div title="Tab 2">Content 2</div>
      <div title="Tab 3">Content 3</div>
    </Tabs>
  );

  it("renders tabs and panels correctly", () => {
    render(<TestTabs />);
    expect(screen.getByRole("tab", { name: "Tab 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 3" })).toBeInTheDocument();
    expect(screen.getByText("Content 1")).toBeVisible();
    expect(screen.getByText("Content 2")).not.toBeVisible();
  });

  it("associates tabs with panels using ARIA attributes", () => {
    const { container } = render(<TestTabs />);
    const tab1 = screen.getByRole("tab", { name: "Tab 1" });

    const panelId = tab1.getAttribute("aria-controls");
    expect(panelId).not.toBeNull();

    const panel1 = container.querySelector(`#${panelId}`);
    expect(panel1).toBeInTheDocument();

    expect(panel1).toHaveTextContent("Content 1");
    expect(panel1).toHaveAttribute("role", "tabpanel");
    expect(panel1).toHaveAttribute("aria-labelledby", tab1.id);
  });

  it("switches tabs on click", () => {
    render(<TestTabs />);
    const tab2 = screen.getByRole("tab", { name: "Tab 2" });

    fireEvent.click(tab2);

    expect(tab2).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Content 1")).not.toBeVisible();
    expect(screen.getByText("Content 2")).toBeVisible();
  });

  it("handles keyboard navigation (ArrowRight, ArrowLeft, Home, End)", () => {
    render(<TestTabs />);
    const tab1 = screen.getByRole("tab", { name: "Tab 1" });
    const tab2 = screen.getByRole("tab", { name: "Tab 2" });
    const tab3 = screen.getByRole("tab", { name: "Tab 3" });

    tab1.focus();
    expect(tab1).toHaveFocus();

    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(tab2).toHaveFocus();

    fireEvent.keyDown(tab2, { key: "ArrowRight" });
    expect(tab3).toHaveFocus();

    // Loop around
    fireEvent.keyDown(tab3, { key: "ArrowRight" });
    expect(tab1).toHaveFocus();

    fireEvent.keyDown(tab1, { key: "ArrowLeft" });
    expect(tab3).toHaveFocus();

    fireEvent.keyDown(tab3, { key: "Home" });
    expect(tab1).toHaveFocus();

    fireEvent.keyDown(tab1, { key: "End" });
    expect(tab3).toHaveFocus();
  });

  it("does not unmount inactive tabs", () => {
    render(<TestTabs />);
    expect(screen.getByText("Content 1")).toBeInTheDocument();
    expect(screen.getByText("Content 2")).toBeInTheDocument();
    expect(screen.getByText("Content 3")).toBeInTheDocument();

    expect(screen.getByText("Content 1")).toBeVisible();
    expect(screen.getByText("Content 2")).not.toBeVisible();
  });
});
