import type { APIRoute } from 'astro';
import { createIdeaReactionStore } from '@/stores/idea-reaction.store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { title, summary, rawInput, sourceType, tags, aiStructure } = data;

    if (!title || !summary || !rawInput || !sourceType) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const store = createIdeaReactionStore();
    const newIdea = await store.saveCommunityIdea({
      title,
      summary,
      rawInput,
      sourceType,
      tags: tags || [],
      aiStructure: aiStructure || {
        problem: '',
        targetUsers: '',
        possibleSolutions: [],
        validationSteps: [],
        risks: [],
      },
    });

    return new Response(JSON.stringify({ success: true, id: newIdea.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }
};
