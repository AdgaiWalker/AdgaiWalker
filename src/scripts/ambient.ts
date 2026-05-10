// 背景动效系统 (lvyovo 风格：模糊色块)
interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

const BLOB_COUNT = 3;
const COLORS = [
  'rgba(53, 191, 171, 0.05)', // brand teal
  'rgba(200, 220, 180, 0.1)',  // yellow-green
  'rgba(31, 201, 231, 0.05)', // brand secondary
];

function createBlob(w: number, h: number): Blob {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.2,
    vy: (Math.random() - 0.5) * 0.2,
    size: 200 + Math.random() * 400,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

export function initParticles() {
  const canvas = document.getElementById('ambient-particles') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let blobs: Blob[] = [];
  let animId = 0;
  let running = true;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
  }

  function spawn() {
    blobs = Array.from({ length: BLOB_COUNT }, () => createBlob(w, h));
  }

  function draw(b: Blob) {
    const gradient = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
    gradient.addColorStop(0, b.color);
    gradient.addColorStop(1, 'transparent');

    ctx!.beginPath();
    ctx!.fillStyle = gradient;
    ctx!.arc(b.x, b.y, b.size, 0, Math.PI * 2);
    ctx!.fill();
  }

  function loop() {
    if (!running) return;
    animId = requestAnimationFrame(loop);

    ctx!.clearRect(0, 0, w, h);

    for (const b of blobs) {
      b.x += b.vx;
      b.y += b.vy;

      if (b.x < -b.size) b.x = w + b.size;
      if (b.x > w + b.size) b.x = -b.size;
      if (b.y < -b.size) b.y = h + b.size;
      if (b.y > h + b.size) b.y = -b.size;

      draw(b);
    }
  }

  function start() {
    running = true;
    animId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(animId);
  }

  resize();
  spawn();
  start();

  window.addEventListener('resize', () => {
    resize();
    spawn();
  });

  document.addEventListener('astro:after-swap', () => {
    stop();
    resize();
    spawn();
    start();
  });
}

if (typeof document !== 'undefined') {
  initParticles();
}
