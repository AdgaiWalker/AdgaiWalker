import { describe, expect, it } from "vitest";
import { singleRunGrant } from "./GrantPanel";

describe("授权面板", () => {
  it("新授权默认一次运行，不包含修改或发布", () => {
    const body = singleRunGrant("agent-1", "grantkey0001", Date.parse("2026-09-22T00:00:00.000Z"));
    expect(body.runLimit).toBe(1);
    expect(body.actions).toEqual(["agent:run"]);
    expect(body.actions.join(",")).not.toContain("publish");
    expect(body.actions.join(",")).not.toContain("apply");
  });
});
