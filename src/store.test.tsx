import { render, screen, fireEvent } from "@testing-library/react";
import { useStore } from "./store";

const TestComponent = () => {
  const { count, increment } = useStore();
  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>Increment</button>
    </div>
  );
};

describe("Zustand Store", () => {
  it("should increment the count", () => {
    render(<TestComponent />);
    const countElement = screen.getByText("0");
    expect(countElement).toBeInTheDocument();

    const incrementButton = screen.getByText("Increment");
    fireEvent.click(incrementButton);

    const newCountElement = screen.getByText("1");
    expect(newCountElement).toBeInTheDocument();
  });
});
