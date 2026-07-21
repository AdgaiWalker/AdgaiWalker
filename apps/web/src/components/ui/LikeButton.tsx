/**
 * LikeButton — 展示块：只接收数据与 onLike
 */
import { Heart } from 'lucide-react';

export type LikeButtonProps = {
  count: number | null;
  busy?: boolean;
  error?: string | null;
  onLike: () => void;
};

export function LikeButton({
  count,
  busy = false,
  error = null,
  onLike,
}: LikeButtonProps) {
  return (
    <div>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={onLike}
      >
        <Heart size={15} />
        赞 {count === null ? '…' : count}
      </button>
      {error ? <span className="meta"> · {error}</span> : null}
    </div>
  );
}
