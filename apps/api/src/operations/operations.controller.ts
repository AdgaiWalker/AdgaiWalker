import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { parseOpsPagination } from "@walker/shared";
import { validationError } from "../common/http-error";
import { OperationsService } from "./operations.service";

/** 默认管理鉴权；不加入公开白名单。 */
@Controller("ops")
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}
  @Get("capabilities") capabilities() {
    return this.operations.capabilities();
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
