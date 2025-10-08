import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
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

    act(() => {
      tab1.focus();
    });
    fireEvent.click(tab1);
    await waitFor(() => expect(tab1).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    await waitFor(() => expect(tab2).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab2, { key: "ArrowRight" });
    await waitFor(() => expect(tab3).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab3, { key: "ArrowRight" }); // Should loop
    await waitFor(() => expect(tab1).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab1, { key: "ArrowLeft" }); // Should loop
    await waitFor(() => expect(tab3).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab3, { key: "ArrowLeft" });
    await waitFor(() => expect(tab2).toHaveAttribute("aria-selected", "true"));
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

    act(() => {
      tab2.focus();
    });
    fireEvent.click(tab2);
    await waitFor(() => expect(tab2).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab2, { key: "Home" });
    await waitFor(() => expect(tab1).toHaveAttribute("aria-selected", "true"));
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

    act(() => {
      tab1.focus();
    });
    fireEvent.click(tab1);
    await waitFor(() => expect(tab1).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(tab1, { key: "End" });
    await waitFor(() => expect(tab3).toHaveAttribute("aria-selected", "true"));
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

    act(() => {
      tab1.focus();
    });
    await waitFor(() => expect(tab1).toHaveAttribute("aria-selected", "true"));

    act(() => {
      tab2.focus();
    });
    fireEvent.keyDown(tab2, { key: "Enter" });
    await waitFor(() => expect(tab2).toHaveAttribute("aria-selected", "true"));

    act(() => {
      tab1.focus();
    });
    fireEvent.keyDown(tab1, { key: " " }); // Space key
    await waitFor(() => expect(tab1).toHaveAttribute("aria-selected", "true"));
  });
});
