/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GISCUS_REPO?: string;
  readonly VITE_GISCUS_REPO_ID?: string;
  readonly VITE_GISCUS_CATEGORY?: string;
  readonly VITE_GISCUS_CATEGORY_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
