import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownPreview } from "./MarkdownPreview";
it("保留 Markdown 正文，隔离脚本、HTML 事件、表单和远端图片", () => {
  const { container } = render(
    <MarkdownPreview
      raw={
        '---\ntitle: 标题\n---\n# 正文\n<script>window.hacked=1</script><img src="https://external/a" onerror="alert(1)"><a href="javascript:alert(1)">坏链接</a><form><input/></form><iframe src="/api/agents"/>'
      }
    />,
  );
  expect(container.querySelector("h1")?.textContent).toBe("正文");
  expect(
    container.querySelector(
      'script,img,form,input,iframe,[onerror],[href^="javascript:"]',
    ),
  ).toBeNull();
});
