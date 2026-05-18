import { visit } from 'unist-util-visit';
import type { Root, Image } from 'mdast';

// 从 B 站 URL 中提取 BV ID
function parseBilibili(url: string): string | null {
  const match = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  return match ? match[1] : null;
}

// 从 YouTube URL 中提取 video ID
function parseYouTube(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return match ? match[1] : null;
}

// 判断是否为音频链接
function isAudioUrl(url: string): boolean {
  return /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url);
}

// 判断是否为 GitHub 仓库链接
function parseGitHub(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w-]+)\/([\w.-]+?)(?:\/|$)/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function svgIcon(name: 'external-link' | 'music' | 'github' | 'arrow-up-right', size: number, className = ''): string {
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${className ? ` class="${className}"` : ''} aria-hidden="true"`;
  const paths: Record<typeof name, string> = {
    'external-link': '<path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>',
    music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path>',
    'arrow-up-right': '<path d="M7 7h10v10"></path><path d="M7 17 17 7"></path>',
  };
  return `<svg ${attrs}>${paths[name]}</svg>`;
}

export default function remarkRichEmbed() {
  return (tree: Root) => {
    visit(tree, 'image', (node: Image, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return;
      const url = node.url;

      // B 站视频
      const bvId = parseBilibili(url);
      if (bvId) {
        parent.children[index] = {
          type: 'html',
          value: `<div class="rich-embed rich-embed-video">
  <div class="rich-embed-ratio">
    <iframe src="https://player.bilibili.com/player.html?bvid=${bvId}&autoplay=0"
      scrolling="no" border="0" frameborder="no" framespacing="0"
      allowfullscreen="true"
      class="rich-embed-iframe"
      loading="lazy">
    </iframe>
  </div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" class="rich-embed-link">
    ${svgIcon('external-link', 12)}
    在 B 站观看
  </a>
</div>`,
        };
        return;
      }

      // YouTube 视频
      const ytId = parseYouTube(url);
      if (ytId) {
        parent.children[index] = {
          type: 'html',
          value: `<div class="rich-embed rich-embed-video">
  <div class="rich-embed-ratio">
    <iframe src="https://www.youtube.com/embed/${ytId}"
      allowfullscreen="true"
      class="rich-embed-iframe"
      loading="lazy">
    </iframe>
  </div>
  <a href="${url}" target="_blank" rel="noopener noreferrer" class="rich-embed-link">
    ${svgIcon('external-link', 12)}
    在 YouTube 观看
  </a>
</div>`,
        };
        return;
      }

      // 音频
      if (isAudioUrl(url)) {
        const title = node.alt || '音频';
        parent.children[index] = {
          type: 'html',
          value: `<div class="rich-embed rich-embed-audio">
  <div class="rich-embed-audio-bar">
    ${svgIcon('music', 16, 'rich-embed-audio-icon')}
    <span class="rich-embed-audio-title">${title}</span>
  </div>
  <audio controls class="rich-embed-audio-player" preload="metadata">
    <source src="${url}" />
  </audio>
</div>`,
        };
        return;
      }

      // GitHub 仓库
      const gh = parseGitHub(url);
      if (gh) {
        parent.children[index] = {
          type: 'html',
          value: `<div class="rich-embed rich-embed-github">
  <a href="${url}" target="_blank" rel="noopener noreferrer" class="rich-embed-github-link">
    ${svgIcon('github', 18, 'rich-embed-github-icon')}
    <div class="rich-embed-github-info">
      <span class="rich-embed-github-repo">${gh.owner}/${gh.repo}</span>
      <span class="rich-embed-github-domain">github.com</span>
    </div>
    ${svgIcon('arrow-up-right', 14, 'rich-embed-github-arrow')}
  </a>
</div>`,
        };
        return;
      }

      // 其他链接：富链接卡
      const domain = (() => {
        try { return new URL(url).hostname; } catch { return ''; }
      })();
      const title = node.alt || '';
      if (domain) {
        parent.children[index] = {
          type: 'html',
          value: `<div class="rich-embed rich-embed-linkcard">
  <a href="${url}" target="_blank" rel="noopener noreferrer" class="rich-embed-linkcard-link">
    <div class="rich-embed-linkcard-info">
      <span class="rich-embed-linkcard-title">${title || domain}</span>
      <span class="rich-embed-linkcard-domain">${domain}</span>
    </div>
    ${svgIcon('external-link', 14, 'rich-embed-linkcard-icon')}
  </a>
</div>`,
        };
      }
    });
  };
}
