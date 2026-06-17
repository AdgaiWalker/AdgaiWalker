import type { APIRoute } from 'astro';
import { readAmbientState, computeFallbackSignals } from '@/lib/ambient/store';
import { toSignalBundle } from '@/lib/ambient/signals';

// 公开只读：返回站主位置的活体信号包（不含坐标）。
// Redis 无 state 时用成都兜底（PRD §11 F1）。
export const GET: APIRoute = async () => {
  const state = (await readAmbientState()) ?? computeFallbackSignals(new Date());
  const bundle = toSignalBundle(state);
  return new Response(JSON.stringify(bundle), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
