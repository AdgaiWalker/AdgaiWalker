export const TOPIC_STATUSES = [
  'INBOX',
  'CANDIDATE',
  'SELECTED',
  'ARCHIVED',
] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export interface ContentBrief {
  audience: string;
  scenario: string;
  problem: string;
  keyQuestion: string;
  intendedAction: string;
}

const TOPIC_TRANSITIONS: Record<TopicStatus, readonly TopicStatus[]> = {
  INBOX: ['CANDIDATE', 'ARCHIVED'],
  CANDIDATE: ['INBOX', 'SELECTED', 'ARCHIVED'],
  SELECTED: ['ARCHIVED'],
  ARCHIVED: ['INBOX', 'CANDIDATE'],
};

export function assertTopicTransition(from: TopicStatus, to: TopicStatus): void {
  if (from === to) return;
  if (!TOPIC_TRANSITIONS[from].includes(to)) {
    throw new Error('invalid-topic-transition');
  }
}

export function normalizeContentBrief(input: ContentBrief): ContentBrief {
  const value: ContentBrief = {
    audience: input.audience.trim(),
    scenario: input.scenario.trim(),
    problem: input.problem.trim(),
    keyQuestion: input.keyQuestion.trim(),
    intendedAction: input.intendedAction.trim(),
  };
  if (Object.values(value).some((item) => item.length === 0)) {
    throw new Error('content-brief-incomplete');
  }
  return value;
}
