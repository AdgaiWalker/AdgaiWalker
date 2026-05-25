// 背景流光粒子动效系统 (融合 lvyovo 设计美学的高饱和度色彩流动系统)
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  currentColor: RGBA;
  targetColor: RGBA;
  phase: number;
  speed: number;
}

const BLOB_COUNT = 4;

// 定义四大活力主题对应的极富生命力的色彩库
const THEME_COLORS: Record<string, RGBA[]> = {
  nature: [
    { r: 53, g: 191, b: 171, a: 0.45 },   // 薄荷青 (Teal)
    { r: 255, g: 215, b: 0, a: 0.4 },     // 向日葵金 (Gold)
    { r: 31, g: 201, b: 231, a: 0.45 },   // 晶莹蔚蓝 (Cyan)
    { r: 255, g: 71, b: 148, a: 0.35 }    // 蜜桃红 (Rose Pink)
  ],
  aurora: [
    { r: 240, g: 46, b: 170, a: 0.42 },   // 极光玫红
    { r: 6, g: 182, b: 212, a: 0.45 },    // 极光靛蓝
    { r: 139, g: 92, b: 246, a: 0.42 },   // 幽邃霓紫
    { r: 99, g: 102, b: 241, a: 0.35 }    // 电光靛蓝
  ],
  sunset: [
    { r: 249, g: 115, b: 22, a: 0.45 },   // 晚霞红橘
    { r: 244, g: 63, b: 94, a: 0.42 },    // 玫瑰绯红
    { r: 251, g: 191, b: 36, a: 0.45 },   // 落日暖金
    { r: 254, g: 202, b: 202, a: 0.35 }   // 浅色蜜桃
  ],
  mint: [
    { r: 16, g: 185, b: 129, a: 0.45 },   // 翡翠嫩绿
    { r: 20, g: 184, b: 166, a: 0.45 },   // 数码青绿
    { r: 132, g: 204, b: 22, a: 0.42 },   // 青柠檬绿
    { r: 6, g: 182, b: 212, a: 0.35 }     // 湖泊天青
  ]
};

// 获取当前的 Body 主题名称
function getActiveTheme(): string {
  if (document.body.classList.contains('theme-aurora')) return 'aurora';
  if (document.body.classList.contains('theme-sunset')) return 'sunset';
  if (document.body.classList.contains('theme-mint')) return 'mint';
  return 'nature';
}

function createBlob(w: number, h: number, i: number, theme: string): Blob {
  const colorSet = THEME_COLORS[theme] || THEME_COLORS.nature;
  const targetColor = colorSet[i % colorSet.length];
  
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.12, // 极其缓慢、温和地流动
    vy: (Math.random() - 0.5) * 0.12,
    size: 280 + Math.random() * 320, // 稍微缩小的粒子，配合高斯模糊创造完美景深
    currentColor: { ...targetColor }, // 拷贝初始颜色
    targetColor: { ...targetColor },
    phase: Math.random() * Math.PI * 2,
    speed: 0.0002 + Math.random() * 0.0004
  };
}

let animId = 0;
let running = false;
let resizeBound = false;
let onResize: (() => void) | null = null;

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
    const currentTheme = getActiveTheme();
    blobs = Array.from({ length: BLOB_COUNT }, (_, i) => createBlob(w, h, i, currentTheme));
  }

  function draw(b: Blob) {
    // 缓动颜色插值，实现切换配色时的丝滑无缝过渡！
    b.currentColor.r += (b.targetColor.r - b.currentColor.r) * 0.035;
    b.currentColor.g += (b.targetColor.g - b.currentColor.g) * 0.035;
    b.currentColor.b += (b.targetColor.b - b.currentColor.b) * 0.035;
    b.currentColor.a += (b.targetColor.a - b.currentColor.a) * 0.035;

    const colorStr = `rgba(${Math.round(b.currentColor.r)}, ${Math.round(b.currentColor.g)}, ${Math.round(b.currentColor.b)}, ${b.currentColor.a})`;

    const gradient = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
    gradient.addColorStop(0, colorStr);
    gradient.addColorStop(0.65, colorStr.replace(/[\d.]+\)$/, `${b.currentColor.a * 0.15})`)); // 边缘极度平滑过渡
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

    // 获取当前活动的主题
    const activeTheme = getActiveTheme();
    const activeColorSet = THEME_COLORS[activeTheme] || THEME_COLORS.nature;

    blobs.forEach((b, i) => {
      // 更新该粒子在当前主题下的目标颜色
      b.targetColor = activeColorSet[i % activeColorSet.length];

      // 沿正弦路线优雅浮动
      b.x += b.vx + Math.sin(time * b.speed + b.phase) * 0.25;
      b.y += b.vy + Math.cos(time * b.speed * 0.7 + b.phase) * 0.18;

      // 触壁平滑回弹
      if (b.x < -b.size) b.x = w + b.size;
      if (b.x > w + b.size) b.x = -b.size;
      if (b.y < -b.size) b.y = h + b.size;
      if (b.y > h + b.size) b.y = -b.size;

      draw(b);
    });
  }

  if (animId) cancelAnimationFrame(animId);
  running = true;
  resize();
  spawn();
  loop();

  if (!resizeBound) {
    onResize = () => { resize(); spawn(); };
    window.addEventListener('resize', onResize);
    resizeBound = true;
  }
}

function cleanup() {
  if (animId) cancelAnimationFrame(animId);
  running = false;
  if (onResize) {
    window.removeEventListener('resize', onResize);
    onResize = null;
  }
  resizeBound = false;
}

// 首次加载与 Astro 页面流转绑定
initParticles();
document.addEventListener('astro:page-load', initParticles);
document.addEventListener('astro:before-swap', cleanup);
