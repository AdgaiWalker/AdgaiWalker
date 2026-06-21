export {};

declare global {
  type WalkerAdminDialogTone = 'default' | 'danger';

  interface Window {
    __ieStandalone?: {
      originalSlug: string;
      draftTemplate: string;
      topicIdParam?: string;
    };
    WalkerAdminUI?: {
      confirm(options: {
        title?: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        tone?: WalkerAdminDialogTone;
      }): Promise<boolean>;
      prompt(options: {
        title?: string;
        message: string;
        initialValue?: string;
        placeholder?: string;
        multiline?: boolean;
        confirmText?: string;
        cancelText?: string;
      }): Promise<string | null>;
      notify(options: {
        title?: string;
        message: string;
        tone?: WalkerAdminDialogTone;
        confirmText?: string;
      }): Promise<void>;
    };
  }
}
