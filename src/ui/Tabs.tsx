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
  activeTab?: number;
  onTabChange?: (index: number) => void;
}

export const Tabs: React.FC<TabsProps> = ({
  children,
  defaultActiveTab = 0,
  activeTab: controlledActiveTab,
  onTabChange,
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultActiveTab);

  const currentActiveTab =
    controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

  const handleTabChange = (index: number) => {
    if (controlledActiveTab === undefined) {
      setInternalActiveTab(index);
    }
    onTabChange?.(index);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs = React.Children.toArray(
      children,
    ) as React.ReactElement<TabPanelProps>[];
    let newIndex = currentActiveTab;

    switch (event.key) {
      case "ArrowRight":
        newIndex = (currentActiveTab + 1) % tabs.length;
        break;
      case "ArrowLeft":
        newIndex = (currentActiveTab - 1 + tabs.length) % tabs.length;
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

    handleTabChange(newIndex);
    // Focus the new tab
    const newTabButton = document.getElementById(`tab-${newIndex}`);
    newTabButton?.focus();
  };

  return (
    <div role="tablist">
      {React.Children.map(children, (child, index) => (
        <button
          role="tab"
          aria-selected={index === currentActiveTab}
          aria-controls={`panel-${index}`}
          id={`tab-${index}`}
          tabIndex={index === currentActiveTab ? 0 : -1}
          onClick={() => handleTabChange(index)}
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
          hidden={index !== currentActiveTab}
        >
          {child.props.children}
        </div>
      ))}
    </div>
  );
};
