export interface NavItem {
  label: string;
  href: string;
  icon: string;
  hint?: string;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}
