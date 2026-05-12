// 背景动效系统 (更有机的模糊色块运动)
interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  phase: number;
  speed: number;
}

const BLOB_COUNT = 4;
const COLORS = [
  'rgba(53, 191, 171, 0.04)',  // brand teal
  'rgba(200, 220, 180, 0.08)', // yellow-green
  'rgba(31, 201, 231, 0.04)',  // brand secondary
  'rgba(180, 210, 170, 0.06)', // sage
];

function createBlob(w: number, h: number, i: number): Blob {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    size: 250 + Math.random() * 350,
    color: COLORS[i % COLORS.length],
    phase: Math.random() * Math.PI * 2,
    speed: 0.0003 + Math.random() * 0.0005,
  };
}

let animId = 0;
let running = false;

export function initParticles() {
  const canvas = document.getElementById('ambient-particles') as HTMLCanvasElement;
  if (!canvas) {
    if (animId) cancelAnimationFrame(animId);
    running = false;
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let blobs: Blob[] = [];
  let time = 0;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
  }

  function spawn() {
    blobs = Array.from({ length: BLOB_COUNT }, (_, i) => createBlob(w, h, i));
  }

  function draw(b: Blob) {
    const gradient = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
    gradient.addColorStop(0, b.color);
    gradient.addColorStop(0.6, b.color.replace(/[\d.]+\)$/, '0.02)'));
    gradient.addColorStop(1, 'transparent');

    ctx!.beginPath();
    ctx!.fillStyle = gradient;
    ctx!.arc(b.x, b.y, b.size, 0, Math.PI * 2);
    ctx!.fill();
  }

  function loop() {
    if (!running) return;
    animId = requestAnimationFrame(loop);
    time++;

    ctx!.clearRect(0, 0, w, h);

    for (const b of blobs) {
      b.x += b.vx + Math.sin(time * b.speed + b.phase) * 0.3;
      b.y += b.vy + Math.cos(time * b.speed * 0.7 + b.phase) * 0.2;

      if (b.x < -b.size) b.x = w + b.size;
      if (b.x > w + b.size) b.x = -b.size;
      if (b.y < -b.size) b.y = h + b.size;
      if (b.y > h + b.size) b.y = -b.size;

      draw(b);
    }
  }

  if (animId) cancelAnimationFrame(animId);
  running = true;
  resize();
  spawn();
  loop();

  if (!(window as any).__ambientResizeBound) {
    window.addEventListener('resize', () => {
      resize();
      spawn();
    });
    (window as any).__ambientResizeBound = true;
  }
}

document.addEventListener('astro:page-load', initParticles);
