import React, { useState, useId } from "react";

interface TabPanelProps {
  title: string;
  children: React.ReactNode;
}

interface TabsProps {
  children: React.ReactElement<TabPanelProps>[];
}

const Tabs: React.FC<TabsProps> = ({ children }) => {
  const [activeTab, setActiveTab] = useState(0);
  const baseId = useId();

  return (
    <div>
      <div role="tablist">
        {children.map((child, index) => {
          const tabId = `${baseId}-tab-${index}`;
          const panelId = `${baseId}-panel-${index}`;

          return (
            <button
              key={index}
              id={tabId}
              role="tab"
              aria-controls={panelId}
              aria-selected={index === activeTab}
              onClick={() => setActiveTab(index)}
              onKeyDown={(e) => {
                let newIndex = activeTab;
                let newTab: HTMLElement | null = null;

                switch (e.key) {
                  case "ArrowRight":
                    newIndex = (activeTab + 1) % children.length;
                    break;
                  case "ArrowLeft":
                    newIndex =
                      (activeTab - 1 + children.length) % children.length;
                    break;
                  case "Home":
                    newIndex = 0;
                    break;
                  case "End":
                    newIndex = children.length - 1;
                    break;
                  case "Enter":
                  case " ":
                    // The default behavior for space/enter on a button is to fire a click event.
                    // We let that happen and don't need to call setActiveTab here.
                    return;
                  default:
                    return;
                }

                e.preventDefault(); // Prevent scrolling on arrow key press
                setActiveTab(newIndex);

                // Focus the new tab
                newTab =
                  e.currentTarget.parentElement?.querySelector(
                    `#${baseId}-tab-${newIndex}`,
                  ) ?? null;
                newTab?.focus();
              }}
            >
              {child.props.title}
            </button>
          );
        })}
      </div>
      <div>
        {children.map((child, index) => {
          const tabId = `${baseId}-tab-${index}`;
          const panelId = `${baseId}-panel-${index}`;
          return (
            <div
              key={index}
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId}
              hidden={index !== activeTab}
            >
              {child.props.children}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Tabs;
