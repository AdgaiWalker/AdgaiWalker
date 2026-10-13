/**
 * 文本行级差异比对工具（纯函数）
 * 供文章编辑比较、冲突查看与审批审阅共用
 */

export type DiffLineType = 'unchanged' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface TextDiffSummary {
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  hasChanges: boolean;
  lines: DiffLine[];
}

export function computeTextDiff(oldText: string, newText: string): TextDiffSummary {
  if (oldText === newText) {
    if (!oldText) {
      return {
        addedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        hasChanges: false,
        lines: [],
      };
    }
    const lines = oldText.split(/\r?\n/).map((text, idx) => ({
      type: 'unchanged' as const,
      text,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
    }));
    return {
      addedCount: 0,
      removedCount: 0,
      unchangedCount: lines.length,
      hasChanges: false,
      lines,
    };
  }

  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  if (oldLines.length === 0) {
    const lines = newLines.map((text, idx) => ({
      type: 'added' as const,
      text,
      newLineNumber: idx + 1,
    }));
    return {
      addedCount: lines.length,
      removedCount: 0,
      unchangedCount: 0,
      hasChanges: lines.length > 0,
      lines,
    };
  }

  if (newLines.length === 0) {
    const lines = oldLines.map((text, idx) => ({
      type: 'removed' as const,
      text,
      oldLineNumber: idx + 1,
    }));
    return {
      addedCount: 0,
      removedCount: lines.length,
      unchangedCount: 0,
      hasChanges: lines.length > 0,
      lines,
    };
  }

  // 优化：剥离首尾相同行（Common Prefix / Suffix），防止大文件 O(M*N) 内存与耗时爆炸
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefixDiff: DiffLine[] = [];
  for (let k = 0; k < prefixLen; k++) {
    prefixDiff.push({
      type: 'unchanged',
      text: oldLines[k],
      oldLineNumber: k + 1,
      newLineNumber: k + 1,
    });
  }

  const midOld = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const midNew = newLines.slice(prefixLen, newLines.length - suffixLen);

  const m = midOld.length;
  const n = midNew.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (midOld[i] === midNew[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const midDiff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
      midDiff.push({
        type: 'unchanged',
        text: midOld[i - 1],
        oldLineNumber: prefixLen + i,
        newLineNumber: prefixLen + j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      midDiff.push({
        type: 'added',
        text: midNew[j - 1],
        newLineNumber: prefixLen + j,
      });
      j--;
    } else if (i > 0) {
      midDiff.push({
        type: 'removed',
        text: midOld[i - 1],
        oldLineNumber: prefixLen + i,
      });
      i--;
    }
  }

  midDiff.reverse();

  const suffixDiff: DiffLine[] = [];
  const oldSuffixStart = oldLines.length - suffixLen;
  const newSuffixStart = newLines.length - suffixLen;
  for (let k = 0; k < suffixLen; k++) {
    suffixDiff.push({
      type: 'unchanged',
      text: oldLines[oldSuffixStart + k],
      oldLineNumber: oldSuffixStart + k + 1,
      newLineNumber: newSuffixStart + k + 1,
    });
  }

  const rawDiff: DiffLine[] = [...prefixDiff, ...midDiff, ...suffixDiff];

  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  for (const line of rawDiff) {
    if (line.type === 'added') addedCount++;
    else if (line.type === 'removed') removedCount++;
    else unchangedCount++;
  }

  return {
    addedCount,
    removedCount,
    unchangedCount,
    hasChanges: addedCount > 0 || removedCount > 0,
    lines: rawDiff,
  };
}
