/**
 * 凭据（页）
 * 职责：API key / token 的加密存取入口。明文仅“揭示”时短暂出现；
 * 底层 AES-256-GCM 落库，密钥在服务器 .env，不进 Git。
 *
 * 依赖：adminApi.credentials
 * 调用：GET/PUT/DELETE /credentials
 * 触发：/credentials
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { adminApi, type CredentialRecord } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

const PROVIDER_OPTIONS = [
  'deepseek-official',
  'openai',
  'anthropic',
  'google',
  'other',
] as const;

export function CredentialsPage() {
  const [list, setList] = useState<CredentialRecord[]>([]);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<string>('deepseek-official');
  const [secret, setSecret] = useState('');
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      setList(await adminApi.credentials.list());
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = () =>
    void run(async () => {
      await adminApi.credentials.upsert({
        name,
        provider,
        secret,
        note: note || undefined,
      });
      setName('');
      setSecret('');
      setNote('');
      setList(await adminApi.credentials.list());
    });

  return (
    <div>
      <header className="page-head">
        <h1>
          <KeyRound size={22} aria-hidden />
          凭据
        </h1>
        <p className="page-lead">
          API key / token 加密管理（AES-256-GCM 落库）。代码进仓库，密钥数据永不进。
        </p>
      </header>

      <div className="panel">
        <h3>新增 / 更新</h3>
        <label htmlFor="cred-name">名称（唯一，同名覆盖更新）</label>
        <input
          id="cred-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="deepseek"
        />
        <label htmlFor="cred-provider">提供方</label>
        <select
          id="cred-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label htmlFor="cred-secret">密钥</label>
        <input
          id="cred-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
        />
        <label htmlFor="cred-note">备注（可选）</label>
        <input
          id="cred-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="用途 / 到期时间等"
        />
        <div>
          <button type="button" disabled={!name || secret.length < 8} onClick={upsert}>
            保存
          </button>
          <button type="button" className="secondary" onClick={() => void load()}>
            刷新
          </button>
        </div>
        {err ? <p className="error">{err}</p> : null}
      </div>

      <div className="panel">
        <h3>已存凭据</h3>
        {!list.length ? (
          <p className="muted">暂无。上方录入第一条。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>提供方</th>
                <th>尾 4 位</th>
                <th>备注</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.provider}</td>
                  <td>
                    {revealed[c.id] ? (
                      <code>{revealed[c.id]}</code>
                    ) : (
                      <code>****{c.last4}</code>
                    )}
                  </td>
                  <td>{c.note ?? '—'}</td>
                  <td>{new Date(c.updatedAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void run(async () => {
                          if (revealed[c.id]) {
                            const { [c.id]: _drop, ...rest } = revealed;
                            setRevealed(rest);
                            return;
                          }
                          const r = await adminApi.credentials.reveal(c.id);
                          setRevealed((prev) => ({ ...prev, [c.id]: r.secret }));
                        })
                      }
                    >
                      {revealed[c.id] ? '隐藏' : '揭示'}
                    </button>{' '}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (!window.confirm(`删除凭据 ${c.name}？`)) return;
                        void run(async () => {
                          await adminApi.credentials.remove(c.id);
                          setList(await adminApi.credentials.list());
                        });
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">
          揭示仅在当前页面内存中短暂显示，刷新即隐；底层为密文存储，主密钥只存服务器。
        </p>
      </div>
    </div>
  );
}
