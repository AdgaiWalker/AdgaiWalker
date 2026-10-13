import "reflect-metadata";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppModule } from "../app.module";
import { PRISMA, type PrismaPort } from "../ports/prisma.port";
import { OperationsService } from "./operations.service";
let app: INestApplication, base: string, dir: string;
let db: NonNullable<ReturnType<PrismaPort["getClient"]>>;
const agentId = `framework-${randomUUID()}`,
  secondId = `framework-${randomUUID()}`;
const token = "isolated-kernel-test-token";
const headers = { "x-admin-token": token };
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "walker-ops-test-"));
  vi.stubEnv("CONTENT_LOG_DIR", dir);
  vi.stubEnv("WALKER_ADMIN_TOKEN", token);
  vi.stubEnv("AI_ENABLED", "false");
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get<PrismaPort>(PRISMA).getClient()!;
  await db.agentUnit.createMany({
    data: [
      {
        id: agentId,
        name: "隔离测试角色",
        prompt: "不可出现在列表的提示词",
        modelId: "test-model",
      },
      { id: secondId, name: "另一角色", prompt: "私有配置" },
    ],
  });
  await db.agentRun.createMany({
    data: [
      {
        id: `${agentId}-a`,
        agentId,
        instruction: "测试输入",
        output: "测试结果",
        model: "test-model",
        status: "SUCCESS",
        tokensPrompt: 4,
        tokensCompletion: 6,
        elapsedMs: 10,
      },
      {
        id: `${agentId}-b`,
        agentId,
        instruction: "失败输入",
        output: "",
        model: "test-model",
        status: "FAILED",
      },
      {
        id: `${agentId}-c`,
        agentId: secondId,
        instruction: "另一角色输入",
        output: "",
        model: "test-model",
      },
    ],
  });
});
afterAll(async () => {
  if (db) {
    await db.agentRun.deleteMany({
      where: { agentId: { in: [agentId, secondId] } },
    });
    await db.agentUnit.deleteMany({
      where: { id: { in: [agentId, secondId] } },
    });
  }
  await app?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("真实 Kernel 接线拒绝匿名管理读取，Basic 凭据可复用", async () => {
  for (const route of [
    "/ops/capabilities",
    "/ops/agents",
    "/ops/runs",
    "/admin/content/ledger",
  ])
    expect((await fetch(base + route)).status).toBe(401);
  const response = await fetch(base + "/ops/capabilities", {
    headers: {
      authorization: `Basic ${Buffer.from(`owner:${token}`).toString("base64")}`,
    },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.database).toBe("sqlite");
  expect(
    body.items
      .filter((x: { state: string }) => x.state === "available")
      .map((x: { key: string }) => x.key),
  ).toEqual(["contentRead", "agentsRead", "runsRead", "agentExecute", "agentDeploy", "conversations", "contentWrite", "contentPublish", "reminders"]);
  expect(
    body.items.find((x: { key: string }) => x.key === "contentWrite").state,
  ).toBe("available");
});
it("只读角色映射不创建默认角色、不返回提示词或供应商秘密", async () => {
  const count = await db.agentUnit.count();
  const body = await (await fetch(base + "/ops/agents", { headers })).json();
  expect(
    body.items.find((x: { id: string }) => x.id === agentId),
  ).toMatchObject({ revision: null, modelId: "test-model" });
  expect(JSON.stringify(body)).not.toContain("不可出现在");
  expect(await db.agentUnit.count()).toBe(count);
});
it("历史记录按归属分页、未知计量留空、列表不加载长文本", async () => {
  const response = await fetch(
    base + `/ops/runs?agentId=${agentId}&pageSize=1&page=1`,
    { headers },
  );
  const body = await response.json();
  expect(body.total).toBe(2);
  expect(body.items).toHaveLength(1);
  expect(body.items[0].agentId).toBe(agentId);
  expect(body.items[0]).not.toHaveProperty("output");
  const failed = await (
    await fetch(base + `/ops/runs/${agentId}-b`, { headers })
  ).json();
  expect(failed).toMatchObject({
    tokens: null,
    elapsedMs: null,
    status: "FAILED",
    revision: null,
    delivery: null,
  });
  const success = await (
    await fetch(base + `/ops/runs/${agentId}-a`, { headers })
  ).json();
  expect(success).toMatchObject({
    tokens: 10,
    elapsedMs: 10,
    instruction: "测试输入",
    output: "测试结果",
  });
  expect(
    (await fetch(base + "/ops/runs/missing-run", { headers })).status,
  ).toBe(404);
  expect((await fetch(base + "/ops/runs?page=-1", { headers })).status).toBe(
    400,
  );
});
it("内容空态、读取正本与404；GET 不写内容", async () => {
  expect(
    (await (await fetch(base + "/admin/content/ledger", { headers })).json())
      .items,
  ).toEqual([]);
  const raw =
    "---\ntitle: 框架测试文章\ntype: knowledge\nvisibility: draft\n---\n正文";
  await writeFile(path.join(dir, "test-note.md"), raw);
  const list = await (
    await fetch(base + "/admin/content/ledger", { headers })
  ).json();
  expect(list.items[0].slug).toBe("test-note");
  expect(
    (await (await fetch(base + "/admin/content/test-note", { headers })).json())
      .raw,
  ).toBe(raw);
  expect(
    (await fetch(base + "/admin/content/not-found", { headers })).status,
  ).toBe(404);
  expect(await readFile(path.join(dir, "test-note.md"), "utf8")).toBe(raw);
});
it("存储故障与空数据分开，能力不谎报可用", async () => {
  const prisma = app.get<PrismaPort>(PRISMA),
    spy = vi.spyOn(prisma, "getClient").mockReturnValue(null);
  const capabilities = await app.get(OperationsService).capabilities();
  expect(capabilities.items.find((x) => x.key === "agentsRead")?.state).toBe(
    "unavailable",
  );
  expect(capabilities.items.find((x) => x.key === "conversations")?.state).toBe("unavailable");
  spy.mockRestore();
  vi.stubEnv("CONTENT_LOG_DIR", path.join(dir, "missing-directory"));
  expect(
    (await app.get(OperationsService).capabilities()).items.find(
      (x) => x.key === "contentRead",
    )?.state,
  ).toBe("unavailable");
  vi.stubEnv("CONTENT_LOG_DIR", dir);
});
