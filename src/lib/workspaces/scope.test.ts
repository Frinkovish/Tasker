import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALL_WORKSPACES,
  hrefForScope,
  parseWorkspaceScope,
  resolveActiveScope,
  withScope,
} from "./scope.ts";

const IDS = ["a", "b"];

describe("parseWorkspaceScope", () => {
  it("accepts a known workspace id", () => {
    assert.equal(parseWorkspaceScope("a", IDS), "a");
  });

  it("falls back to all workspaces for anything else", () => {
    for (const raw of [undefined, null, "", "unknown", ["a", "b"]]) {
      assert.equal(parseWorkspaceScope(raw, IDS), ALL_WORKSPACES);
    }
  });
});

describe("resolveActiveScope", () => {
  it("reads the query parameter on ordinary pages", () => {
    assert.equal(resolveActiveScope("/dashboard", "b", IDS), "b");
  });

  it("prefers the workspace in the path on a workspace page", () => {
    assert.equal(resolveActiveScope("/workspaces/a", "b", IDS), "a");
  });
});

describe("withScope", () => {
  it("leaves the default scope out of the URL", () => {
    assert.equal(withScope("/inbox", ALL_WORKSPACES), "/inbox");
  });

  it("adds a specific workspace to the URL", () => {
    assert.equal(withScope("/inbox", "a"), "/inbox?workspace=a");
  });
});

describe("hrefForScope", () => {
  it("keeps the user on the current page", () => {
    assert.equal(hrefForScope("/dashboard", "a"), "/dashboard?workspace=a");
    assert.equal(hrefForScope("/dashboard", ALL_WORKSPACES), "/dashboard");
  });

  it("moves between workspace pages", () => {
    assert.equal(hrefForScope("/workspaces/a", "b"), "/workspaces/b");
  });

  it("leaves a workspace page when choosing all workspaces", () => {
    assert.equal(hrefForScope("/workspaces/a", ALL_WORKSPACES), "/dashboard");
  });
});
