/** 站主资料（SSOT）：首页自述 / 作品 / 工具 / 在线 与 /me 共用；以后补内容或换域名只改这里。 */
import { SITE_DESCRIPTION } from '@walker/shared';

export type WorkEntry = { name: string; years?: string; story: string; slug?: string; link?: string };
export type TalkEntry = { title: string; href: string; date: string };
export type OnlineEntry = { platform: string; href?: string; copyValue?: string; handle: string };
export type HeroImage = { src: string; alt: string; width: number; height: number };

/**
 * 三站矩阵地址：
 * - iwalk.pro（本站）：个人 Wiki 站（认知、判断、复盘与人生记录）
 * - DIY_BOT_WIKI_URL：对外的 DIY Bot 工作（教程）站（后续从 bot.goodloop.si 切至 goodloop.si）
 * - STUDIO_SITE_URL：未然界域工作室站（后续从 goodloop.si 切至 cuspnow.com）
 */
export const STUDIO_SITE_URL = 'https://goodloop.si';
export const DIY_BOT_WIKI_URL = 'https://bot.goodloop.si';
export const WORDS_SITE_URL = 'https://usd.goodloop.si';

export const PROFILE = {
  greeting: '你好，我是 Dora。',
  intro: [
    `05 年生，黑河学院 24 级艺术生，AI 实践主义者。${SITE_DESCRIPTION}`,
    '吃美食、用 bot、出海赚钱、预测未来。这是我的 Wiki：学说人话，记下人生余下 29 年。',
  ] as readonly string[],
  hero: null as HeroImage | null,
  /** /me 开头：状态与方法论 */
  aboutLead: [
    'Walker 是一种状态：带着自己的目标，准备出发、正在出发、歇会再出发。空乘专业给了我时间，马哲给了我方法，AI 给了我路。',
  ] as readonly string[],
  /** /me 里核心理念指向的公开文章 */
  aboutLink: { slug: 'bot-physical-body', title: 'Bot 的精华在物理环境，不在管理方式' },
  /** 「我做过的事」：公开验证过的经历演进 */
  did: [
    '2026 年 11 月，在 Linux 主机上跑顺不关机的 Bot 体系，把日常拆单、执行与交叉复核交给机器。',
    '2026 年 10 月，把哥飞的公开文章蒸馏成出海 Agent 发到 GitHub 和 X，AI 还能替我写推文、回评论。做到后来发现它写的东西我自己判断不了，涨了关注，没赚到钱——注意力得先守住，再花出去。',
    '同一个月，试着把日常选择交给概率决策模型 Jev：口号选哪句、动画改不改。碰到改动画它给了 0.54，几乎在抛硬币。小事可以交给概率，拿不准和改变方向的事，决定权在人。',
    '2026 年 3 月，在海拉鲁编程客远程实习写文稿，本想帮海哥减负，结果成了负担，就结束了。更早做过找资源平台、在抖音直播聊 AI、建过学习群——现在觉得不用站上讲台，把验证过的做法留成 Wiki 就够了。',
    '2025 年夏天开始用 AI 写代码，11 月独立上线第一个网站 xyzidea.com；2026 年 5 月搭起这个站（iwalk.pro），一直记到现在。',
  ] as readonly string[],
  work: [
    {
      name: '未然界域',
      years: '2026–',
      story: '我的工作室，带着好奇去探 AI 的边界。',
      link: STUDIO_SITE_URL,
    },
    {
      name: 'DIY Bot 工作手册',
      years: '2026–',
      // 待 4173 教程站正式切入 bot.goodloop.si 后启用 link: DIY_BOT_WIKI_URL
      story: '给人和 AI 用的 DeepSeek Bot 手册：搭不关机的环境、划账号红线、派单与独立验收（准备挂至 bot.goodloop.si）。',
    },
    {
      name: '今日新词',
      years: '2026–',
      story: '每天自动扫一遍海外新词与搜索趋势，筛值得做的需求。',
      link: WORDS_SITE_URL,
    },
    {
      name: 'xyzidea.com',
      years: '2025',
      story: '用 AI 帮你找东西的检索站，我第一个独立上线的网站。',
      link: 'https://www.xyzidea.com',
    },
  ] as readonly WorkEntry[],
  projects: [
    {
      name: 'DoraZoom',
      years: '2026',
      slug: 'dorazoom',
      link: 'https://dorazoom.iwalk.pro/',
      story: '有些想法，圈一下就懂。Mac 上缩放、圈画、白板、截图、OCR 与录制。',
    },
    {
      name: 'dsh-id',
      years: '2026',
      link: 'https://github.com/AdgaiWalker/dsh-id',
      story: '给 Agent 用的本地账号执行层：凭据不进对话、不落明文，只在执行那一瞬解开。',
    },
    {
      name: 'dsh-mail',
      years: '2026',
      link: 'https://github.com/AdgaiWalker/dsh-mail',
      story: '跑在 Cloudflare Workers KV 上的极简收件箱，给 Bot 自动收验证码和通知。',
    },
    {
      name: '长青 · OwnLine',
      years: '2026',
      link: 'https://github.com/AdgaiWalker/VPN-OwnLine',
      story: '两分钟在自有云服务器上搭好独享节点，带流量熔断与双落地自愈。',
    },
    {
      name: 'Jevify',
      years: '2026',
      link: 'https://github.com/AdgaiWalker/jevify',
      story: '大模型前置门禁与访客额度守卫——别再为一句「你好」烧 Token。',
    },
    {
      name: 'Minimal UX Motion Guard',
      years: '2026',
      link: 'https://github.com/AdgaiWalker/minimal-ux-motion-guard',
      story: '3 秒盲看测试、砍掉拐杖文案、补齐兜底三件套。',
    },
    {
      name: '哥飞 Agent',
      years: '2026',
      link: 'https://github.com/AdgaiWalker/gefei-agent',
      story: '把哥飞公开分享的出海选词、SEO 与建站方法蒸馏成可提问的技能，每条回答注明出处。',
    },
  ] as readonly WorkEntry[],
  talks: [] as readonly TalkEntry[],
  thanks:
    '一路走来要感谢很多人——引我入门的秋芝，带我成长的海哥（海拉鲁编程客），还有陪我一起折腾的朋友们。',
  online: [
    { platform: 'X', href: 'https://x.com/praxiswalker', handle: '@praxiswalker' },
    { platform: 'GitHub', href: 'https://github.com/AdgaiWalker', handle: 'AdgaiWalker' },
    { platform: 'Bilibili', href: 'https://space.bilibili.com/1029612512', handle: 'space.bilibili.com/1029612512' },
    { platform: '小红书', href: 'https://www.xiaohongshu.com/user/profile/689dd905000000001802921e', handle: '哆啦' },
    { platform: '微信', copyValue: 'wrjy2049', handle: 'wrjy2049' },
    { platform: '邮件', href: 'mailto:praxiswalker@outlook.com', handle: 'praxiswalker@outlook.com' },
  ] as readonly OnlineEntry[],
};

/** 外链显示为干净的域名/仓库路径：去协议、www.、mailto:、末尾斜杠。 */
export function displayHandle(url: string): string {
  return url.replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}
