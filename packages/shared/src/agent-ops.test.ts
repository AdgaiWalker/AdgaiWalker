import { expect, it } from "vitest";
import { parseOpsPagination } from "./agent-ops.js";
it("分页默认值与边界明确", () => {
  expect(parseOpsPagination()).toEqual({ page: 1, pageSize: 20 });
  expect(parseOpsPagination("2", "100")).toEqual({ page: 2, pageSize: 100 });
  for (const value of ["0", "-1", "1.5", "1e2", "NaN", "100001"])
    expect(parseOpsPagination(value)).toBeNull();
  expect(parseOpsPagination("1", "101")).toBeNull();
});
