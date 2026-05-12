import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingState } from "./LoadingState";


describe("LoadingState", () => {
  it("renders title and body", () => {
    render(<LoadingState title="起動待ち" body="Cloud Run を待っています。" />);

    expect(screen.getByText("起動待ち")).toBeInTheDocument();
    expect(screen.getByText("Cloud Run を待っています。")).toBeInTheDocument();
  });
});
