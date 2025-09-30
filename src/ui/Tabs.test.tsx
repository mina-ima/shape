import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Tabs, TabPanel } from "./Tabs";
describe("Tabs Component", () => {
  it("should render tabs with correct labels", () => {
    render(
      <Tabs>
        <TabPanel label="Tab 1">Content 1</TabPanel>
        <TabPanel label="Tab 2">Content 2</TabPanel>
      </Tabs>,
    );
    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display the content of the default active tab", () => {
    render(
      <Tabs defaultActiveTab={0}>
        <TabPanel label="Tab 1">Content 1</TabPanel>
        <TabPanel label="Tab 2">Content 2</TabPanel>
      </Tabs>,
    );
    expect(screen.getByText("Content 1")).toBeVisible();
    expect(screen.queryByText("Content 2")).not.toBeVisible();
  });

  it("should change active tab and content on click", () => {
    render(
      <Tabs>
        <TabPanel label="Tab 1">Content 1</TabPanel>
        <TabPanel label="Tab 2">Content 2</TabPanel>
      </Tabs>,
    );

    fireEvent.click(screen.getByText("Tab 2"));

    expect(screen.getByText("Content 2")).toBeVisible();
    expect(screen.queryByText("Content 1")).not.toBeVisible();
  });

  it("should have correct accessibility attributes", () => {
    render(
      <Tabs defaultActiveTab={0}>
        <TabPanel label="Tab 1">Content 1</TabPanel>
        <TabPanel label="Tab 2">Content 2</TabPanel>
      </Tabs>,
    );

    const tab1 = screen.getByText("Tab 1");
    const tab2 = screen.getByText("Tab 2");
    const panel1 = screen.getByText("Content 1").closest('[role="tabpanel"]');
    const panel2 = screen.getByText("Content 2").closest('[role="tabpanel"]');
    expect(panel2).toHaveAttribute("hidden");

    expect(tab1).toHaveAttribute("role", "tab");
    expect(tab1).toHaveAttribute("aria-selected", "true");
    expect(tab1).toHaveAttribute("id", "tab-0");
    expect(tab1).toHaveAttribute("aria-controls", "panel-0");
    expect(tab1).toHaveAttribute("tabIndex", "0");

    expect(tab2).toHaveAttribute("role", "tab");
    expect(tab2).toHaveAttribute("aria-selected", "false");
    expect(tab2).toHaveAttribute("id", "tab-1");
    expect(tab2).toHaveAttribute("aria-controls", "panel-1");
    expect(tab2).toHaveAttribute("tabIndex", "-1");

    expect(panel1).toHaveAttribute("role", "tabpanel");
    expect(panel1).toHaveAttribute("id", "panel-0");
    expect(panel1).toHaveAttribute("aria-labelledby", "tab-0");
    expect(panel1).not.toHaveAttribute("hidden");

    expect(panel2).toHaveAttribute("role", "tabpanel");
    expect(panel2).toHaveAttribute("id", "panel-1");
    expect(panel2).toHaveAttribute("aria-labelledby", "tab-1");
    expect(panel2).toHaveAttribute("hidden");
  });

  it("should navigate tabs with arrow keys", () => {
    render(
      <Tabs>
        <TabPanel label="Tab 1">Content 1</TabPanel>
        <TabPanel label="Tab 2">Content 2</TabPanel>
        <TabPanel label="Tab 3">Content 3</TabPanel>
      </Tabs>,
    );

    const tab1 = screen.getByText("Tab 1");
    const tab2 = screen.getByText("Tab 2");
    const tab3 = screen.getByText("Tab 3");

    fireEvent.focus(tab1);
    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(tab2).toHaveFocus();
    expect(screen.getByText("Content 2")).toBeVisible();

    fireEvent.keyDown(tab2, { key: "ArrowLeft" });
    expect(tab1).toHaveFocus();
    expect(screen.getByText("Content 1")).toBeVisible();

    fireEvent.keyDown(tab1, { key: "ArrowLeft" }); // Wrap around
    expect(tab3).toHaveFocus();
    expect(screen.getByText("Content 3")).toBeVisible();

    fireEvent.keyDown(tab3, { key: "ArrowRight" }); // Wrap around
    expect(tab1).toHaveFocus();
    expect(screen.getByText("Content 1")).toBeVisible();
  });

  it("should navigate to first/last tab with Home/End keys", () => {
    render(
      <Tabs>
        <TabPanel label="Tab 1">Content 1</TabPanel>
        <TabPanel label="Tab 2">Content 2</TabPanel>
        <TabPanel label="Tab 3">Content 3</TabPanel>
      </Tabs>,
    );

    const tab1 = screen.getByText("Tab 1");
    const tab2 = screen.getByText("Tab 2");
    const tab3 = screen.getByText("Tab 3");

    fireEvent.focus(tab2);
    fireEvent.keyDown(tab2, { key: "Home" });
    expect(tab1).toHaveFocus();
    expect(screen.getByText("Content 1")).toBeVisible();

    fireEvent.keyDown(tab1, { key: "End" });
    expect(tab3).toHaveFocus();
    expect(screen.getByText("Content 3")).toBeVisible();
  });
});
