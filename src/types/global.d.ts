export {};

declare global {
  interface Window {
    __ieStandalone?: {
      originalSlug: string;
      draftTemplate: string;
    };
  }
}
