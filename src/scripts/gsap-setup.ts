/**
 * GSAP 全局配置 + 动效基础设施
 * - 统一默认值（duration / ease）
 * - matchMedia 支持 reduced-motion
 * - 注册 ScrollTrigger 插件
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// 项目级默认值
gsap.defaults({
  duration: 0.5,
  ease: 'power2.out',
});

// matchMedia — 响应式 + reduced-motion
export const mm = gsap.matchMedia();

export { gsap, ScrollTrigger };
