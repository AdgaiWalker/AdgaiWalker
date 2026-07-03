/**
 * idea-reaction.store — 点子交互（我需要、我也想过、我能帮）与社区发布仓储
 *
 * 采用统一的 Upstash Redis + 内存双工降级架构。
 */
import { randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import { getRedis } from '@/stores/redis-client';

export interface IdeaHelpRecord {
  id: string;
  ideaId: string;
  name: string;
  email: string;
  helpType: string;
  note: string;
  createdAt: string;
}

export interface CommunityIdea {
  id: string;
  title: string;
  summary: string;
  rawInput: string;
  sourceType: string;
  status: 'thinking' | 'validating' | 'building' | 'verified' | 'archived';
  date: string;
  tags: string[];
  aiStructure: {
    problem: string;
    targetUsers: string;
    possibleSolutions: string[];
    validationSteps: string[];
    risks: string[];
  };
}

export interface IdeaReactions {
  need: number;
  thought_before: number;
  can_help: number;
  favorite: number;
}

export interface IdeaReactionStore {
  getReactions(ideaId: string): Promise<IdeaReactions>;
  addReaction(ideaId: string, type: 'need' | 'thought_before' | 'favorite'): Promise<number>;
  addHelp(ideaId: string, record: Omit<IdeaHelpRecord, 'id' | 'ideaId' | 'createdAt'>): Promise<void>;
  getHelps(ideaId: string): Promise<IdeaHelpRecord[]>;
  saveCommunityIdea(idea: Omit<CommunityIdea, 'id' | 'date' | 'status'>): Promise<CommunityIdea>;
  listCommunityIdeas(): Promise<CommunityIdea[]>;
  getCommunityIdea(id: string): Promise<CommunityIdea | null>;
}

// ---------------------------------------------------------------------------
// Keys 定义
// ---------------------------------------------------------------------------
const reactionsKey = (ideaId: string) => `idea:reactions:${ideaId}`;
const helpsKey = (ideaId: string) => `idea:helps:${ideaId}`;
const communityListKey = () => `idea:community:list`;
const communityItemKey = (ideaId: string) => `idea:community:item:${ideaId}`;

// ---------------------------------------------------------------------------
// 内存降级存储（单元测试与 Local dev 兜底）
// ---------------------------------------------------------------------------
class InMemoryIdeaReactionStore implements IdeaReactionStore {
  private reactions = new Map<string, Record<string, number>>();
  private helps = new Map<string, IdeaHelpRecord[]>();
  private communityIdeas = new Map<string, CommunityIdea>();
  private communityList: string[] = [];

  async getReactions(ideaId: string): Promise<IdeaReactions> {
    const val = this.reactions.get(reactionsKey(ideaId)) ?? {};
    return {
      need: val.need ?? 0,
      thought_before: val.thought_before ?? 0,
      can_help: val.can_help ?? 0,
      favorite: val.favorite ?? 0,
    };
  }

  async addReaction(ideaId: string, type: 'need' | 'thought_before' | 'favorite'): Promise<number> {
    const key = reactionsKey(ideaId);
    const current = this.reactions.get(key) ?? {};
    const nextVal = (current[type] ?? 0) + 1;
    current[type] = nextVal;
    this.reactions.set(key, current);
    return nextVal;
  }

  async addHelp(ideaId: string, record: Omit<IdeaHelpRecord, 'id' | 'ideaId' | 'createdAt'>): Promise<void> {
    const key = helpsKey(ideaId);
    const list = this.helps.get(key) ?? [];
    const helpRecord: IdeaHelpRecord = {
      ...record,
      id: randomUUID(),
      ideaId,
      createdAt: new Date().toISOString(),
    };
    list.push(helpRecord);
    this.helps.set(key, list);

    // 联动反应中的 can_help 计数自增
    const rKey = reactionsKey(ideaId);
    const current = this.reactions.get(rKey) ?? {};
    current.can_help = (current.can_help ?? 0) + 1;
    this.reactions.set(rKey, current);
  }

  async getHelps(ideaId: string): Promise<IdeaHelpRecord[]> {
    return this.helps.get(helpsKey(ideaId)) ?? [];
  }

  async saveCommunityIdea(idea: Omit<CommunityIdea, 'id' | 'date' | 'status'>): Promise<CommunityIdea> {
    const id = `community-idea-${randomUUID().slice(0, 8)}`;
    const fullIdea: CommunityIdea = {
      ...idea,
      id,
      status: 'thinking',
      date: new Date().toISOString(),
    };
    this.communityIdeas.set(communityItemKey(id), fullIdea);
    this.communityList.unshift(id);
    return fullIdea;
  }

  async listCommunityIdeas(): Promise<CommunityIdea[]> {
    return this.communityList
      .map(id => this.communityIdeas.get(communityItemKey(id)))
      .filter((i): i is CommunityIdea => i !== undefined);
  }

  async getCommunityIdea(id: string): Promise<CommunityIdea | null> {
    return this.communityIdeas.get(communityItemKey(id)) ?? null;
  }
}

const memoryStore = new InMemoryIdeaReactionStore();

// ---------------------------------------------------------------------------
// Upstash Redis 存储实现
// ---------------------------------------------------------------------------
class UpstashIdeaReactionStore implements IdeaReactionStore {
  constructor(private redis: Redis) {}

  async getReactions(ideaId: string): Promise<IdeaReactions> {
    try {
      const hash = await this.redis.hgetall<Record<string, number>>(reactionsKey(ideaId));
      return {
        need: Number(hash?.need ?? 0),
        thought_before: Number(hash?.thought_before ?? 0),
        can_help: Number(hash?.can_help ?? 0),
        favorite: Number(hash?.favorite ?? 0),
      };
    } catch {
      return memoryStore.getReactions(ideaId);
    }
  }

  async addReaction(ideaId: string, type: 'need' | 'thought_before' | 'favorite'): Promise<number> {
    try {
      return await this.redis.hincrby(reactionsKey(ideaId), type, 1);
    } catch {
      return memoryStore.addReaction(ideaId, type);
    }
  }

  async addHelp(ideaId: string, record: Omit<IdeaHelpRecord, 'id' | 'ideaId' | 'createdAt'>): Promise<void> {
    try {
      const helpRecord: IdeaHelpRecord = {
        ...record,
        id: randomUUID(),
        ideaId,
        createdAt: new Date().toISOString(),
      };
      await this.redis.rpush(helpsKey(ideaId), JSON.stringify(helpRecord));
      // 同时自增 can_help 计数
      await this.redis.hincrby(reactionsKey(ideaId), 'can_help', 1);
    } catch {
      await memoryStore.addHelp(ideaId, record);
    }
  }

  async getHelps(ideaId: string): Promise<IdeaHelpRecord[]> {
    try {
      const list = await this.redis.lrange<string>(helpsKey(ideaId), 0, -1);
      return list.map(item => JSON.parse(item) as IdeaHelpRecord);
    } catch {
      return memoryStore.getHelps(ideaId);
    }
  }

  async saveCommunityIdea(idea: Omit<CommunityIdea, 'id' | 'date' | 'status'>): Promise<CommunityIdea> {
    try {
      const id = `community-idea-${randomUUID().slice(0, 8)}`;
      const fullIdea: CommunityIdea = {
        ...idea,
        id,
        status: 'thinking',
        date: new Date().toISOString(),
      };
      await this.redis.set(communityItemKey(id), JSON.stringify(fullIdea));
      await this.redis.lpush(communityListKey(), id);
      return fullIdea;
    } catch {
      return memoryStore.saveCommunityIdea(idea);
    }
  }

  async listCommunityIdeas(): Promise<CommunityIdea[]> {
    try {
      const ids = await this.redis.lrange<string>(communityListKey(), 0, -1);
      if (ids.length === 0) return [];
      const items = await Promise.all(ids.map(id => this.redis.get<string>(communityItemKey(id))));
      return items
        .filter((item): item is string => item !== null)
        .map(item => JSON.parse(item) as CommunityIdea);
    } catch {
      return memoryStore.listCommunityIdeas();
    }
  }

  async getCommunityIdea(id: string): Promise<CommunityIdea | null> {
    try {
      const raw = await this.redis.get<string>(communityItemKey(id));
      return raw ? (JSON.parse(raw) as CommunityIdea) : null;
    } catch {
      return memoryStore.getCommunityIdea(id);
    }
  }
}

let cached: IdeaReactionStore | undefined;

export function createIdeaReactionStore(): IdeaReactionStore {
  if (cached) return cached;
  const redis = getRedis();
  if (redis) {
    cached = new UpstashIdeaReactionStore(redis);
    return cached;
  }
  cached = memoryStore;
  return cached;
}
