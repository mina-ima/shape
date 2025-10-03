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
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                setActiveTab(
                  (prevActiveTab) => (prevActiveTab + 1) % children.length,
                );
              } else if (event.key === "ArrowLeft") {
                setActiveTab(
                  (prevActiveTab) =>
                    (prevActiveTab - 1 + children.length) % children.length,
                );
              } else if (event.key === "Home") {
                setActiveTab(0);
              } else if (event.key === "End") {
                setActiveTab(children.length - 1);
              }
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
