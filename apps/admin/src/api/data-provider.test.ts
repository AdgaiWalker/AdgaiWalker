import { afterEach, expect, it, vi } from "vitest";
import { dataProvider } from "./data-provider";
const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
  );
afterEach(() => vi.unstubAllGlobals());
it("内容列表保留真实条数、Git 与发布事实可用性", async () => {
  respond({
    items: [{ slug: "a", title: "文章" }],
    generatedAt: "now",
    gitAvailable: false,
    publicationAvailable: true,
  });
  expect(await dataProvider.getList({ resource: "content" })).toEqual({
    data: [{ id: "a", slug: "a", title: "文章" }],
    total: 1,
    generatedAt: "now",
    gitAvailable: false,
    publicationAvailable: true,
  });
});
it("按 Agent 游标读取且不以当前页长度伪造总数", async () => {
  respond({ items: [{ id: "run-1" }], next: "run-1", total: 21 });
  expect(
    await dataProvider.getList({
      resource: "runs",
      pagination: { pageSize: 20 },
      filters: [
        { field: "agentId", operator: "eq", value: "a/b" },
        { field: "cursor", operator: "eq", value: "run-0" },
      ],
    }),
  ).toMatchObject({ total: 21 });
  expect(fetch).toHaveBeenCalledWith(
    "/api/ops/execution-runs?limit=20&agentId=a%2Fb&cursor=run-0",
    expect.anything(),
  );
});
it("空数据、未知资源与后端失败语义分开", async () => {
  respond({ items: [], total: 0 });
  expect(await dataProvider.getList({ resource: "agents" })).toEqual({
    data: [],
    total: 0,
  });
  await expect(
    dataProvider.getList({ resource: "unknown" }),
  ).rejects.toMatchObject({ statusCode: 404 });
  respond({ code: "storage-unavailable", message: "数据库不可用" }, 503);
  await expect(
    dataProvider.getList({ resource: "agents" }),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(
    dataProvider.update({ resource: "content", id: "a", variables: {} }),
  ).rejects.toMatchObject({ statusCode: 405 });
});
