import type { APIContext } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

interface LikeRow {
  page_path: string;
  count: number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

function getSupabase() {
  const url = import.meta.env.SUPABASE_URL;
  const anonKey = import.meta.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizePath(value: string | null | undefined) {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  return value.slice(0, 200);
}

async function readCount(pagePath: string) {
  const supabase = getSupabase();

  if (!supabase) {
    return { count: 0, configured: false };
  }

  const { data, error } = await supabase
    .from('likes')
    .select('page_path, count')
    .eq('page_path', pagePath)
    .maybeSingle<LikeRow>();

  if (error) throw error;

  return { count: data?.count ?? 0, configured: true };
}

async function incrementCount(pagePath: string) {
  const current = await readCount(pagePath);
  if (!current.configured) return current;

  const nextCount = current.count + 1;
  const supabase = getSupabase();

  if (!supabase) {
    return { count: nextCount, configured: false };
  }

  const { data, error } = await supabase
    .from('likes')
    .upsert({ page_path: pagePath, count: nextCount }, { onConflict: 'page_path' })
    .select('page_path, count')
    .single<LikeRow>();

  if (error) throw error;

  return { count: data.count, configured: true };
}

export async function GET(context: APIContext) {
  try {
    const pagePath = normalizePath(context.url.searchParams.get('pagePath'));
    const result = await readCount(pagePath);

    return json({ pagePath, ...result });
  } catch {
    return json({ pagePath: '/', count: 0, configured: false }, 200);
  }
}

export async function POST(context: APIContext) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const pagePath = normalizePath(body.pagePath);
    const result = await incrementCount(pagePath);

    return json({ pagePath, ...result });
  } catch {
    return json({ pagePath: '/', count: 0, configured: false }, 200);
  }
}
