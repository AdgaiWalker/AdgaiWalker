import type { APIRoute } from 'astro';
import { createIdeaReactionStore } from '@/stores/idea-reaction.store';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing idea ID' }), { status: 400 });
  }

  try {
    const { name, email, helpType, note } = await request.json();
    if (!name || !email || !helpType || !note) {
      return new Response(JSON.stringify({ error: 'Missing required form fields' }), { status: 400 });
    }

    const store = createIdeaReactionStore();
    await store.addHelp(id, { name, email, helpType, note });
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }
};
