import path from 'node:path';

/**
 * Derive the pinned dsh-session-persistence-jsonl@0.1.5-rc.3 layout.
 * The upstream format helpers are not exported by the package entry point;
 * keep this implementation aligned with its lib/index.js encodeSegment/projectKey.
 */
export function dshSessionDirectory(dshHome: string, cwd: string, sessionId: string): string {
  const sessionsRoot = path.join(dshHome, 'sessions');
  const project = projectKey(cwd);
  const encodedId = encodeSessionId(sessionId);
  return path.join(sessionsRoot, project, encodedId);
}

export function encodeSessionId(raw: string): string {
  if (raw.length === 0) throw new Error('session-id-empty');
  if (raw === '.') return '~002E';
  if (raw === '..') return '~002E~002E';
  let encoded = '';
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    const character = String.fromCharCode(code);
    encoded += character !== '~' && /^[A-Za-z0-9._-]$/.test(character)
      ? character
      : `~${code.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return encoded;
}

function projectKey(cwd: string): string {
  if (cwd.length === 0) throw new Error('session-cwd-empty');
  let readable = '';
  let separatorRun = false;
  for (let index = 0; index < cwd.length; index += 1) {
    const code = cwd.charCodeAt(index);
    const character = String.fromCharCode(code);
    if (character === '/' || character === '\\' || character === ':') {
      if (!separatorRun) readable += '-';
      separatorRun = true;
    } else if (character !== '~' && /^[A-Za-z0-9._-]$/.test(character)) {
      readable += character;
      separatorRun = false;
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`;
      separatorRun = false;
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`;
}
