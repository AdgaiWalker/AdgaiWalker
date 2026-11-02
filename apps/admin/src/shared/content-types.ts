export interface CustomContentType {
  value: string;
  label: string;
}

export const DEFAULT_CONTENT_TYPES: CustomContentType[] = [
  { value: "knowledge", label: "知识文章 / 日记" },
  { value: "learn", label: "学习笔记" },
  { value: "idea", label: "灵感想法" },
  { value: "project", label: "项目" },
  { value: "tool", label: "工具" },
];

export const CUSTOM_TYPES_STORAGE_KEY = "walker:custom_content_types";

export function getCustomContentTypes(): CustomContentType[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_TYPES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is CustomContentType =>
          Boolean(item && typeof item.value === "string" && typeof item.label === "string" && item.value.trim()),
      );
    }
  } catch {
    // ignore parse error
  }
  return [];
}

export function saveCustomContentType(type: CustomContentType): CustomContentType[] {
  const normalizedValue = type.value.trim().toLowerCase();
  const normalizedLabel = type.label.trim() || normalizedValue;
  if (!normalizedValue) return getCustomContentTypes();

  const current = getCustomContentTypes();
  const filtered = current.filter((item) => item.value !== normalizedValue);
  const updated = [...filtered, { value: normalizedValue, label: normalizedLabel }];
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_TYPES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}
