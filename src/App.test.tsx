import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the project title and default architecture view", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Minima" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Architecture" })).toHaveClass("active");
    expect(screen.getByText("CLI Layer")).toBeInTheDocument();
  });

  it("switches to the scaffold tab", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Scaffold" }));

    expect(screen.getByText("Project Scaffold")).toBeInTheDocument();
  });

  it("switches to the roadmap tab", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Roadmap" }));

    expect(screen.getByRole("heading", { name: "Roadmap" })).toBeInTheDocument();
    expect(screen.getByText(/Three phases from single-binary prototype/i)).toBeInTheDocument();
  });
});
