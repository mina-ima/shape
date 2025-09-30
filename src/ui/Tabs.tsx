import React, { useState } from "react";

interface TabPanelProps {
  label: string;
  children: React.ReactNode;
}

export const TabPanel: React.FC<TabPanelProps> = ({ children }) => {
  return <>{children}</>;
};

interface TabsProps {
  children: React.ReactElement<TabPanelProps>[];
  defaultActiveTab?: number;
}

export const Tabs: React.FC<TabsProps> = ({
  children,
  defaultActiveTab = 0,
}) => {
  const [activeTab, setActiveTab] = useState(defaultActiveTab);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs = React.Children.toArray(
      children,
    ) as React.ReactElement<TabPanelProps>[];
    let newIndex = activeTab;

    switch (event.key) {
      case "ArrowRight":
        newIndex = (activeTab + 1) % tabs.length;
        break;
      case "ArrowLeft":
        newIndex = (activeTab - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        newIndex = 0;
        break;
      case "End":
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    setActiveTab(newIndex);
    // Focus the new tab
    const newTabButton = document.getElementById(`tab-${newIndex}`);
    newTabButton?.focus();
  };

  return (
    <div role="tablist">
      {React.Children.map(children, (child, index) => (
        <button
          role="tab"
          aria-selected={index === activeTab}
          aria-controls={`panel-${index}`}
          id={`tab-${index}`}
          tabIndex={index === activeTab ? 0 : -1}
          onClick={() => setActiveTab(index)}
          onKeyDown={(e) => handleKeyDown(e)}
        >
          {child.props.label}
        </button>
      ))}
      {React.Children.map(children, (child, index) => (
        <div
          role="tabpanel"
          id={`panel-${index}`}
          aria-labelledby={`tab-${index}`}
          hidden={index !== activeTab}
        >
          {child.props.children}
        </div>
      ))}
    </div>
  );
};
