import React, { useState } from "react";

interface TabPanelProps {
  title: string;
  children: React.ReactNode;
}

interface TabsProps {
  children: React.ReactElement<TabPanelProps>[];
}

const Tabs: React.FC<TabsProps> = ({ children }) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <div role="tablist">
        {children.map((child, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === activeTab}
            onClick={() => setActiveTab(index)}
            onKeyDown={(e) => {
              let newIndex = activeTab;
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
                  setActiveTab(index);
                  return;
                default:
                  return;
              }
              setActiveTab(newIndex);
              // Focus the new tab
              const newTab = e.currentTarget.parentElement?.children[
                newIndex
              ] as HTMLElement;
              newTab?.focus();
            }}
          >
            {child.props.title}
          </button>
        ))}
      </div>
      <div>
        {children.map((child, index) => (
          <div key={index} role="tabpanel" hidden={index !== activeTab}>
            {child.props.children}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tabs;
