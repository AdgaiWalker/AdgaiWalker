-- O05：访客问题转更新事项的证据软引用
-- 只加一列可空 JSON：不建新表、不加外键（会话可删除/过期，事项必须保留并如实标注证据不可用）
ALTER TABLE "Action" ADD COLUMN "evidenceRef" JSONB;
