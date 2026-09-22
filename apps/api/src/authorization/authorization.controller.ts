import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
/** 管理中间件验证通过后才允许创建或撤销；公开路由不暴露授权 ID。 */
@Controller('ops')
export class AuthorizationController {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}
  @Post('grants') issue(@Body() body: unknown) { return this.authorization.issue(body, 'owner'); }
  @Post('grants/:id/revoke') revoke(@Param('id') id: string) { return this.authorization.revoke(id, 'owner'); }
  @Get('agents/:id/grants') list(@Param('id') id: string) { return this.authorization.list(id); }
}
