-- R25c（2026-09-23）：提供方与凭据以 dsh 原生管理为唯一真相源，删除本地注册表。
-- 影响：/model-providers 端点与 ModelProviderService 已删除；技能执行的 LlmClient 改读 dsh 目录。
-- 注意：表内的旧密文一并删除；凭据值改由 dsh 凭据来源持有（不落本库）。
PRAGMA foreign_keys=off;
DROP TABLE "Credential";
PRAGMA foreign_keys=on;
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ModelProvider";
PRAGMA foreign_keys=on;
