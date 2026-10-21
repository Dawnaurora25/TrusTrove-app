import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootError from "./error";
import GlobalError from "./global-error";

// Both boundaries log to console.error on mount; silence it so the assertions
// below are the only output.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("route-level error boundaries", () => {
  it("announces the route error through a live alert region (error.tsx)", () => {
    render(
      <RootError error={new Error("indexer unreachable")} reset={() => {}} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Something went wrong.");
    expect(alert).toHaveTextContent("indexer unreachable");
  });

  it("falls back to a generic message but still announces it (error.tsx)", () => {
    render(<RootError error={new Error("")} reset={() => {}} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "An unexpected error occurred while loading this page.",
    );
  });

  it("announces the crash through a live alert region (global-error.tsx)", () => {
    render(
      <GlobalError error={new Error("hydration failed")} reset={() => {}} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("The app crashed.");
    expect(alert).toHaveTextContent("hydration failed");
  });

  // WCAG 3.1.1: global-error.tsx renders its own <html>, replacing the root
  // layout's <html lang="en">, so it must carry the language itself or screen
  // readers fall back to pronunciation rules from the OS language setting.
  it('exposes lang="en" on document.documentElement when GlobalError renders (global-error.tsx)', () => {
    const { container } = render(
      <GlobalError error={new Error("crashed at boot")} reset={() => {}} />,
    );

    const renderedRoot = container.querySelector("html");
    expect(renderedRoot).not.toBeNull();
    expect(renderedRoot).toHaveAttribute("lang", "en");

    // Next.js mounts GlobalError in place of the root layout, so the <html>
    // above *is* the document element. Swap it in to assert the document-level
    // contract, then restore both nodes so React's cleanup finds them.
    const documentRoot = document.documentElement;
    document.replaceChild(renderedRoot!, documentRoot);
    expect(document.documentElement.lang).toBe("en");
    document.replaceChild(documentRoot, renderedRoot!);
    container.appendChild(renderedRoot!);
  });

  // The stylesheet normally arrives via app/layout.tsx, which does not render
  // behind global-error, so the boundary imports it itself.
  it("imports globals.css so the crash screen is not unstyled (global-error.tsx)", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "./global-error.tsx"),
      "utf8",
    );
    expect(source).toContain('import "./globals.css"');
  });
});
