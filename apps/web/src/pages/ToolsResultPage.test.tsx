import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEB_ROUTES } from '../shared/routes';
import { ToolsResultPage } from './ToolsResultPage';

const strip = (path: string) => path.replace(/^\//, '');
const NEXT_STEP = '先写五条大纲；再扩一段正文。';
const STORAGE_KEY = 'walker:intake-result';

function stubMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function renderResultWithState() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: WEB_ROUTES.toolsResult,
          state: {
            result: {
              clueId: 'clue-1',
              nextStep: NEXT_STEP,
              bucketId: 'writing',
              aiUsedFlag: true,
              poolStatus: 'candidate',
            },
            body: '公众号文章写不出来，卡在选题',
            typeId: 'write',
          },
        },
      ]}
    >
      <Routes>
        <Route
          path={strip(WEB_ROUTES.toolsResult)}
          element={<ToolsResultPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function seedStoredResult(): void {
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      result: {
        clueId: 'clue-9',
        nextStep: NEXT_STEP,
        bucketId: 'writing',
        aiUsedFlag: true,
        poolStatus: 'candidate',
      },
      body: '公众号文章写不出来，卡在选题',
      typeId: 'write',
      savedAt: new Date().toISOString(),
    }),
  );
}

function renderResult() {
  return render(
    <MemoryRouter initialEntries={[WEB_ROUTES.toolsResult]}>
      <Routes>
        <Route
          path={strip(WEB_ROUTES.toolsResult)}
          element={<ToolsResultPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('卡结果页', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    stubMotion(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('没有结果时诚实说明并给回卡口入口', () => {
    renderResult();

    expect(
      screen.getByRole('heading', { name: '这一步在这里找不到了' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '回卡口再问一次' }),
    ).toHaveAttribute('href', WEB_ROUTES.ask);
  });

  it('刷新后从会话存储还原结果，并标注真实来源', () => {
    seedStoredResult();
    renderResult();

    expect(screen.getByRole('heading', { name: '你的下一步' })).toBeInTheDocument();
    expect(screen.getByText('先写五条大纲')).toBeInTheDocument();
    expect(screen.getByText('AI 生成 · 服务端已校验')).toBeInTheDocument();
    expect(screen.getByText('写作与表达')).toBeInTheDocument();
  });

  it('依据区只展示真实字段，并声明不展示模型内部推理', async () => {
    seedStoredResult();
    const user = userEvent.setup();
    renderResult();

    await user.click(screen.getByText('这份结论是怎么来的？'));

    expect(screen.getByText(/不展示模型内部推理/)).toBeInTheDocument();
    expect(screen.getByText('clue-9')).toBeInTheDocument();
    expect(screen.getByText(/候选/)).toBeInTheDocument();
    expect(screen.queryByText(/命中触发词/)).toBeNull();
  });

  it('复制结论写入剪贴板并给出回执', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    seedStoredResult();
    renderResult();

    // 用 fireEvent：userEvent.setup 会接管 navigator.clipboard，覆盖掉本测试的桩
    fireEvent.click(screen.getByRole('button', { name: /复制结论/ }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(NEXT_STEP);
    });
    expect(screen.getByRole('button', { name: /已复制/ })).toBeInTheDocument();
  });

  it('刚生成时逐字呈现（尚未直出）', () => {
    stubMotion(false);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([] as never);
    renderResultWithState();

    expect(document.querySelector('.answer-typing')).not.toBeNull();
  });

  it('刷新时直出文本，不再重播打字动画', () => {
    stubMotion(false);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' },
    ] as never);
    renderResultWithState();

    expect(document.querySelector('.answer-typing')).toBeNull();
    expect(screen.getByText('先写五条大纲')).toBeInTheDocument();
  });
});
