import type { APIRoute } from 'astro';
import { createIdeaReactionStore } from '@/stores/idea-reaction.store';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing idea ID' }), { status: 400 });
  }

  const store = createIdeaReactionStore();
  const reactions = await store.getReactions(id);
  return new Response(JSON.stringify(reactions), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing idea ID' }), { status: 400 });
  }

  try {
    const { type } = await request.json();
    if (type !== 'need' && type !== 'thought_before' && type !== 'favorite') {
      return new Response(JSON.stringify({ error: 'Invalid reaction type' }), { status: 400 });
    }

    const store = createIdeaReactionStore();
    const count = await store.addReaction(id, type);
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }
};
