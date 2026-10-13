-- AgentUnit.providerId 不再指向本地 ModelProvider 表（R25：提供方以 dsh 原生目录为唯一真相源）。
-- 保留列与既有值，只去掉外键关系。
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'bot',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "providerId" TEXT,
    "modelId" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "prompt" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AgentUnit" ("archivedAt", "createdAt", "icon", "id", "isSystem", "modelId", "name", "prompt", "providerId", "updatedAt") SELECT "archivedAt", "createdAt", "icon", "id", "isSystem", "modelId", "name", "prompt", "providerId", "updatedAt" FROM "AgentUnit";
DROP TABLE "AgentUnit";
ALTER TABLE "new_AgentUnit" RENAME TO "AgentUnit";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
