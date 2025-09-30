import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("should render a '撮影/選択' button", () => {
    render(<App />);
    const button = screen.getByRole("button", { name: "撮影/選択" });
    expect(button).toBeInTheDocument();
  });
});
