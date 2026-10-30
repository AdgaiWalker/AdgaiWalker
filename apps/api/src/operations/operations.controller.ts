import { Body, Controller, Get, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { parseOpsPagination } from "@walker/shared";
import {
  getAdminUsername,
  updateAdminPassword,
  verifyAdminPassword,
} from "../auth/admin-token.middleware";
import { getGuestQuota, updateGuestQuota } from "../adapters/prisma-guest-quota.adapter";
import { getJevRoiStats } from "../assistant/jev-fast-path.service";
import { ApiError, validationError } from "../common/http-error";
import { OperationsService } from "./operations.service";

/** 默认管理鉴权；不加入公开白名单。 */
@Controller("ops")
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}
  /** 可追溯的运营统计（O06）：窗口 + 口径来源 + 缺失覆盖一并返回 */
  @Get("overview")
  overview(@Query("window") window?: string) {
    return this.operations.overview({ window });
  }
  @Get("capabilities") capabilities() {
    return this.operations.capabilities();
  }
  @Put("admin-password")
  changePassword(
    @Body() body: { currentPassword?: unknown; newPassword?: unknown },
  ) {
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword.trim() : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword.trim() : "";
    if (!verifyAdminPassword(currentPassword)) {
      throw new ApiError("invalid-current-password", 400, "当前密码不正确");
    }
    if (newPassword.length < 6) {
      throw validationError("新密码长度至少为 6 位");
    }
    updateAdminPassword(newPassword);
    return { ok: true, username: getAdminUsername() };
  }

  @Get("guest-quota")
  async getGuestQuota() {
    const quota = getGuestQuota();
    const stats = await this.operations.guestQuotaStats();
    const jevRoi = getJevRoiStats();
    return { quota, ...stats, jevRoi };
  }

  @Put("guest-quota")
  updateGuestQuota(@Body() body: { quota?: unknown }) {
    const quota = Number(body?.quota);
    if (!Number.isInteger(quota) || quota < 1 || quota > 100000) {
      throw validationError("额度必须是 1 到 100000 之间的整数");
    }
    updateGuestQuota(quota);
    return { ok: true, quota };
  }

  @Post("guest-quota/reset")
  async resetGuestQuotas() {
    await this.operations.resetAllGuestQuotas();
    return { ok: true, quota: getGuestQuota() };
  }
  @Get("agents") agents() {
    return this.operations.agents();
  }
  @Get("runs") runs(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("agentId") agentId?: string,
  ) {
    const paging = parseOpsPagination(page, pageSize);
    if (
      !paging ||
      (agentId !== undefined &&
        (typeof agentId !== "string" || agentId.length > 200))
    )
      throw validationError("分页或 Agent 参数不正确");
    return this.operations.runs({ ...paging, agentId });
  }
  @Get("runs/:id") run(@Param("id") id: string) {
    return this.operations.run(id);
  }
}
