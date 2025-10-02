import React, { useState, useRef, useEffect, KeyboardEvent } from "react";

interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
}

const Tabs: React.FC<TabsProps> = ({ items }) => {
  const [activeTab, setActiveTab] = useState(items[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    tabRefs.current = tabRefs.current.slice(0, items.length);
  }, [items]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab((index + 1) % items.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab((index - 1 + items.length) % items.length);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(items.length - 1);
        break;
      default:
        break;
    }
  };

  const focusTab = (index: number) => {
    tabRefs.current[index]?.focus();
    setActiveTab(items[index].id);
  };

  return (
    <div>
      <div role="tablist" aria-label="Tab navigation">
        {items.map((item, index) => (
          <button
            key={item.id}
            id={item.id}
            role="tab"
            aria-selected={activeTab === item.id}
            aria-controls={`${item.id}-panel`}
            tabIndex={activeTab === item.id ? 0 : -1}
            onClick={() => setActiveTab(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={`${item.id}-panel`}
          id={`${item.id}-panel`}
          role="tabpanel"
          aria-labelledby={item.id}
          hidden={activeTab !== item.id}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
};

export default Tabs;
