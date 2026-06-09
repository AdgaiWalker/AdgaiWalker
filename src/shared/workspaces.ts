export interface WorkspaceConfig {
  id: string;
  label: string;
  match: (path: string) => boolean;
}

export const workspaces: WorkspaceConfig[] = [
  { id: 'content', label: '内容宇宙', match: (path) => path === '/content' || path.startsWith('/content/') },
  { id: 'learn', label: '学习系统', match: (path) => path === '/learn' || path.startsWith('/learn/') || path === '/posts' || path.startsWith('/posts/') },
  { id: 'tools', label: '资源工具', match: (path) => path === '/tools' || path.startsWith('/tools/') },
  { id: 'ideas', label: '点子空间', match: (path) => path === '/ideas' || path.startsWith('/ideas/') },
  { id: 'projects', label: '项目空间', match: (path) => path === '/projects' || path.startsWith('/projects/') || path === '/ferry' || path.startsWith('/ferry/') },
  { id: 'about', label: '关于 Walker', match: (path) => path === '/about' || path.startsWith('/about/') },
];

export function getWorkspaceForPath(path: string): Pick<WorkspaceConfig, 'id' | 'label'> {
  return workspaces.find((item) => item.match(path)) ?? {
    id: 'walker',
    label: 'Walker',
  };
}
