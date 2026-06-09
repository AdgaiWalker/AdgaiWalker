import { randomUUID } from 'node:crypto';

import type { APIRoute } from 'astro';

import { compactText, redactSensitiveText } from '@/agent/privacy';
import {
  saveMatchFeedback,
  type MatchFeedbackEvent,
  type MatchFeedbackType,
} from '@/conversation/store';

const FEEDBACK_TYPES: MatchFeedbackType[] = [
  'resolved',
  'stuck',
  'not-fit',
  'want-tutorial',
  'first-draft',
  'next-step-clear',
  'wrong-direction',
  'need-tutorial',
];
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FEEDBACK_TEXT_LENGTH = 240;

interface FeedbackRequestBody {
  sessionId: string;
  eventId?: string;
  feedbackType: MatchFeedbackType;
  feedbackText?: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function validateBody(body: unknown): body is FeedbackRequestBody {
  if (!body || typeof body !== 'object') return false;
  const data = body as Record<string, unknown>;
  if (typeof data.sessionId !== 'string' || !SESSION_ID_PATTERN.test(data.sessionId)) return false;
  if (data.eventId !== undefined && (typeof data.eventId !== 'string' || !SESSION_ID_PATTERN.test(data.eventId))) return false;
  if (typeof data.feedbackType !== 'string' || !FEEDBACK_TYPES.includes(data.feedbackType as MatchFeedbackType)) return false;
  if (data.feedbackText !== undefined && (typeof data.feedbackText !== 'string' || data.feedbackText.length > MAX_FEEDBACK_TEXT_LENGTH)) return false;
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  let body: FeedbackRequestBody;
  try {
    const raw = await request.json();
    if (!validateBody(raw)) throw new Error('invalid body');
    body = raw;
  } catch {
    return jsonResponse({ error: '反馈格式不正确。' }, 400);
  }

  const feedbackText = body.feedbackText
    ? redactSensitiveText(compactText(body.feedbackText, MAX_FEEDBACK_TEXT_LENGTH)).text
    : undefined;

  const event: MatchFeedbackEvent = {
    feedbackId: randomUUID(),
    sessionId: body.sessionId,
    eventId: body.eventId,
    createdAt: new Date().toISOString(),
    feedbackType: body.feedbackType,
    feedbackText,
  };

  await saveMatchFeedback(event);

  return jsonResponse({
    ok: true,
    feedbackId: event.feedbackId,
  });
};
