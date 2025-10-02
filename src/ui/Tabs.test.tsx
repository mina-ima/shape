import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import React from "react";
import Tabs from "./Tabs"; // Assuming Tabs.tsx will export default Tabs

// Mock component for tab content
const TabPanel = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

describe("Tabs", () => {
  const tabItems = [
    {
      id: "tab1",
      label: "Tab 1",
      content: <TabPanel>Content for Tab 1</TabPanel>,
    },
    {
      id: "tab2",
      label: "Tab 2",
      content: <TabPanel>Content for Tab 2</TabPanel>,
    },
    {
      id: "tab3",
      label: "Tab 3",
      content: <TabPanel>Content for Tab 3</TabPanel>,
    },
  ];

  it("renders the tab list with correct accessibility attributes", () => {
    render(<Tabs items={tabItems} />);

    const tabList = screen.getByRole("tablist");
    expect(tabList).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(tabItems.length);

    tabs.forEach((tab, index) => {
      expect(tab).toHaveAttribute("id", tabItems[index].id);
      expect(tab).toHaveAttribute(
        "aria-controls",
        `${tabItems[index].id}-panel`,
      );
      expect(tab).toHaveAttribute("tabIndex", index === 0 ? "0" : "-1");
    });
  });

  it("renders tab panels with correct accessibility attributes and initial visibility", () => {
    render(<Tabs items={tabItems} />);

    const tabPanels = screen.getAllByRole("tabpanel", { hidden: true }); // Include hidden elements
    expect(tabPanels).toHaveLength(tabItems.length);

    tabPanels.forEach((panel, index) => {
      expect(panel).toHaveAttribute("id", `${tabItems[index].id}-panel`);
      expect(panel).toHaveAttribute("aria-labelledby", tabItems[index].id);
      if (index === 0) {
        expect(panel).not.toHaveAttribute("hidden");
      } else {
        expect(panel).toHaveAttribute("hidden");
      }
    });

    expect(screen.getByText("Content for Tab 1")).toBeVisible();
    expect(screen.queryByText("Content for Tab 2")).not.toBeVisible();
    expect(screen.queryByText("Content for Tab 3")).not.toBeVisible();
  });

  it("changes active tab and panel visibility on click", () => {
    render(<Tabs items={tabItems} />);

    const tab2 = screen.getByRole("tab", { name: "Tab 2" });
    fireEvent.click(tab2);

    expect(tab2).toHaveAttribute("aria-selected", "true");
    expect(tab2).toHaveAttribute("tabIndex", "0");
    expect(screen.getByRole("tab", { name: "Tab 1" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Tab 1" })).toHaveAttribute(
      "tabIndex",
      "-1",
    );

    expect(screen.getByText("Content for Tab 2")).toBeVisible();
    expect(screen.queryByText("Content for Tab 1")).not.toBeVisible();
  });

  it("handles keyboard navigation (ArrowRight, ArrowLeft, Home, End)", () => {
    render(<Tabs items={tabItems} />);

    const tab1 = screen.getByRole("tab", { name: "Tab 1" });
    const tab2 = screen.getByRole("tab", { name: "Tab 2" });
    const tab3 = screen.getByRole("tab", { name: "Tab 3" });

    // ArrowRight
    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(tab2).toHaveFocus();
    fireEvent.keyDown(tab2, { key: "ArrowRight" });
    expect(tab3).toHaveFocus();
    fireEvent.keyDown(tab3, { key: "ArrowRight" }); // Wraps around
    expect(tab1).toHaveFocus();

    // ArrowLeft
    fireEvent.keyDown(tab1, { key: "ArrowLeft" });
    expect(tab3).toHaveFocus();
    fireEvent.keyDown(tab3, { key: "ArrowLeft" });
    expect(tab2).toHaveFocus();

    // Home
    fireEvent.keyDown(tab2, { key: "Home" });
    expect(tab1).toHaveFocus();

    // End
    fireEvent.keyDown(tab1, { key: "End" });
    expect(tab3).toHaveFocus();
  });
});
