import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RouteMetadata } from './RouteMetadata';

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <RouteMetadata />
    </MemoryRouter>,
  );
}

describe('RouteMetadata', () => {
  beforeEach(() => {
    document.head.innerHTML = '<title>Walker</title>';
  });

  it('sets article metadata from the generated content model', async () => {
    renderAt('/posts/lobster-core-value');

    await waitFor(() => {
      expect(document.title).toBe('龙虾的核心价值 · Walker');
    });
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe('https://www.iwalk.pro/posts/lobster-core-value');
    expect(
      document
        .querySelector('link[rel="alternate"][type="text/markdown"]')
        ?.getAttribute('href'),
    ).toBe('https://www.iwalk.pro/posts/lobster-core-value/index.md');
    expect(
      document.querySelector('meta[property="og:type"]')?.getAttribute('content'),
    ).toBe('article');
    expect(
      document.querySelector('#site-json-ld')?.textContent,
    ).toContain('BlogPosting');
  });

  it('clears article-only metadata on a collection route', async () => {
    document.head.insertAdjacentHTML(
      'beforeend',
      '<meta property="article:tag" content="old"><link rel="alternate" type="text/markdown" href="/old.md">',
    );
    renderAt('/posts');

    await waitFor(() => {
      expect(document.title).toBe('证据 · Walker');
    });
    expect(document.querySelector('meta[property^="article:"]')).toBeNull();
    expect(
      document.querySelector('link[rel="alternate"][type="text/markdown"]'),
    ).toBeNull();
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe('https://www.iwalk.pro/posts');
    expect(
      document.querySelector('#site-json-ld')?.textContent,
    ).toContain('CollectionPage');
  });
});
