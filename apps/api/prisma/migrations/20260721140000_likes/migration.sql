-- CreateTable
CREATE TABLE "LikeCounter" (
    "path" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LikeCounter_pkey" PRIMARY KEY ("path")
);
