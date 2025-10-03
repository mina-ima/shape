import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Tabs from "./Tabs";

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

  it("navigates tabs with ArrowRight and ArrowLeft keys", async () => {
    render(
      <Tabs>
        <div title="年齢・和暦">Content 1</div>
        <div title="勤続年数">Content 2</div>
        <div title="定年まで">Content 3</div>
      </Tabs>,
    );

    const tab1 = screen.getByRole("tab", { name: "年齢・和暦" });
    const tab2 = screen.getByRole("tab", { name: "勤続年数" });
    const tab3 = screen.getByRole("tab", { name: "定年まで" });

    fireEvent.click(tab1);
    expect(tab1).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab1, { key: "ArrowRight" });
    });
    expect(tab2).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab2, { key: "ArrowRight" });
    });
    expect(tab3).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab3, { key: "ArrowRight" }); // Should loop back to tab1 or stay on tab3
    });
    expect(tab1).toHaveAttribute("aria-selected", "true"); // Assuming loop

    await act(async () => {
      fireEvent.keyDown(tab1, { key: "ArrowLeft" });
    });
    expect(tab3).toHaveAttribute("aria-selected", "true"); // Assuming loop

    await act(async () => {
      fireEvent.keyDown(tab3, { key: "ArrowLeft" });
    });
    expect(tab2).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to the first tab with Home key", async () => {
    render(
      <Tabs>
        <div title="年齢・和暦">Content 1</div>
        <div title="勤続年数">Content 2</div>
        <div title="定年まで">Content 3</div>
      </Tabs>,
    );

    const tab1 = screen.getByRole("tab", { name: "年齢・和暦" });
    const tab2 = screen.getByRole("tab", { name: "勤続年数" });

    fireEvent.click(tab2);
    expect(tab2).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab2, { key: "Home" });
    });
    expect(tab1).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to the last tab with End key", async () => {
    render(
      <Tabs>
        <div title="年齢・和暦">Content 1</div>
        <div title="勤続年数">Content 2</div>
        <div title="定年まで">Content 3</div>
      </Tabs>,
    );

    const tab1 = screen.getByRole("tab", { name: "年齢・和暦" });
    const tab3 = screen.getByRole("tab", { name: "定年まで" });

    fireEvent.click(tab1);
    expect(tab1).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab1, { key: "End" });
    });
    expect(tab3).toHaveAttribute("aria-selected", "true");
  });

  it("activates tab on Enter or Space key press", async () => {
    render(
      <Tabs>
        <div title="年齢・和暦">Content 1</div>
        <div title="勤続年数">Content 2</div>
      </Tabs>,
    );

    const tab1 = screen.getByRole("tab", { name: "年齢・和暦" });
    const tab2 = screen.getByRole("tab", { name: "勤続年数" });

    fireEvent.click(tab1);
    expect(tab1).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab2, { key: "Enter" });
    });
    expect(tab2).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(tab1, { key: " " }); // Space key
    });
    expect(tab1).toHaveAttribute("aria-selected", "true");
  });
});
