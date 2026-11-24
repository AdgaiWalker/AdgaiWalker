/**
 * 公开问答运行期上下文封装：收敛 actorScope/requestKey 键拼接规则与读写生命周期，
 * 消除 execution-public-chat 与 execution-lifecycle 之间的类型双写与键耦合。
 */
export interface PublicRuntimeContext {
  visitorKey: string;
  sessionId: string | null;
  freshPrompt?: string;
  resultSessionId: string | null;
  conversationId: string | null;
}

export function publicActorScope(principalId: string): string {
  return `public:${principalId}`;
}

export function publicRuntimeContextKey(actorScope: string, requestKey: string): string {
  return `${actorScope}\n${requestKey}`;
}

export class PublicRuntimeContextStore {
  private readonly items = new Map<string, PublicRuntimeContext>();

  set(actorScope: string, requestKey: string, ctx: PublicRuntimeContext): void {
    this.items.set(publicRuntimeContextKey(actorScope, requestKey), ctx);
  }

  get(actorScope: string, requestKey: string): PublicRuntimeContext | null {
    return this.items.get(publicRuntimeContextKey(actorScope, requestKey)) ?? null;
  }

  delete(actorScope: string, requestKey: string): void {
    this.items.delete(publicRuntimeContextKey(actorScope, requestKey));
  }
}
