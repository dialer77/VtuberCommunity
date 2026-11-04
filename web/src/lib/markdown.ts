import { Marked } from "marked";

// 이슈 본문 렌더러. 자동 수집 본문은 LLM 이 웹 자료를 보고 쓴 것이라, 페이지에 숨은 지시(프롬프트 인젝션)로
// 스크립트·위험한 링크가 섞일 수 있다 → 원시 HTML 은 글자로 보여주고, 링크·이미지는 http(s) 만 허용한다.

const SAFE_LINK = /^(https?:\/\/|\/(?!\/)|#)/i;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const md = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html(token) {
      return esc(token.text);
    },
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      if (!SAFE_LINK.test(token.href)) return text;
      const external = /^https?:/i.test(token.href);
      return `<a href="${esc(token.href)}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${text}</a>`;
    },
    image(token) {
      if (!/^https:\/\//i.test(token.href)) return esc(token.text);
      return `<img src="${esc(token.href)}" alt="${esc(token.text)}" loading="lazy" referrerpolicy="no-referrer">`;
    },
  },
});

export function renderMarkdown(src: string): string {
  return md.parse(src) as string;
}
