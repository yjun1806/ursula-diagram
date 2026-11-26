---
description: 'Claude Code, Codex, Cursor 같은 AI 코딩 에이전트용 ursula 스킬입니다. Mermaid를 쓰고 한 번의 호출로 점검하며 그립니다. npx skills add로 설치합니다.'
---

# 에이전트 스킬

`skills/ursula`는 코딩 에이전트용 스킬입니다. `SKILL.md`는 에이전트에게 Mermaid 글을 쓰는 법, `--check`를
붙여 그리면서 엔진에 그림을 점검받는 법, 읽는 사람에게 줄 출력을 고르는 법을 알려 줍니다. `scripts/ursula.mjs`는 명령을 한 파일로 묶은
것이어서, 스킬은 Node 22 이상만 있으면 아무것도 설치하지 않고 돌아갑니다.

에이전트가 직접 읽을 수 있게 영어 문서의 모든 페이지를 Markdown으로 [llms.txt](https://yjun1806.github.io/ursula-diagram/llms.txt)와 [llms-full.txt](https://yjun1806.github.io/ursula-diagram/llms-full.txt)에 담았습니다.

[skills](https://skills.sh) 명령으로 설치합니다. Claude Code, Codex, Cursor 같은 에이전트에서 쓸 수 있습니다. 스킬을 둘 곳을 고릅니다. 이 프로젝트, 모든 프로젝트(`-g`), 한 에이전트(`-a`) 가운데 하나입니다.

::: code-group

```bash [이 프로젝트]
npx skills add yjun1806/ursula-diagram
```

```bash [모든 프로젝트]
npx skills add yjun1806/ursula-diagram -g
```

```bash [한 에이전트]
npx skills add yjun1806/ursula-diagram -a claude-code
```

:::

`skills/ursula` 폴더를 에이전트의 스킬 폴더에 직접 복사해도 됩니다. 이 폴더는 npm 패키지에도 들어 있습니다.

```bash
cp -R "$(npm root -g)/ursula-diagram/skills/ursula" ~/.claude/skills/
```

skills 명령으로 설치한 스킬은 같은 명령으로 업데이트합니다.

```bash
npx skills update
```

스킬에 든 명령으로 `ursula-diagram update`를 실행하면 새 버전이 나와 있는지 알려 주고 이 명령을 출력합니다. 스킬 자체는 바꾸지 않습니다.

스킬을 쓰면 에이전트는 Mermaid 글을 쓰고 `--check`와 `--fix`(틀린 머리글·키워드와 flowchart의 `->`를 고치고 고친 곳을
알립니다)를 붙여 그린 뒤, 독자가 있는 곳에 맞춰 출력을 고릅니다. 터미널에는
`text`, 채팅이나 웹 페이지에는 `text-svg`, 파일에는 `svg`나 `html`을 줍니다.

## MCP로

셸이 없는 에이전트에서는 `ursula-diagram mcp`가 같은 명령을 표준 입출력 MCP 서버로 띄웁니다. 도구는 셋입니다.
`render`(`format`, `width`, `charset`, 점검 결과를 함께 받는 `check`, `fix`), `check`(`fix`), `syntax`. `render`는 따로 정하지 않으면
`text` 형식을 `width` 100으로 그립니다. `format`은 `text`, `text-svg`, `svg`, `html`, `png` 가운데 하나입니다. `fix: true`를 주면
결과 끝에 고친 곳과 고친 글이 붙습니다. `format: "png"`(`theme`은 light나 dark)는 그림을 이미지 내용으로 돌려줘서, 이미지를
보여 주는 클라이언트에서 그림이 바로 보입니다. `@resvg/resvg-js`가 있어야 하고, 없으면 설치 명령을 담은 오류가 돌아옵니다.
글꼴이 없으면 이미지와 함께 어떤 글자가 빠졌는지 적은 `warning: …` 한 줄이 돌아옵니다.

Claude Code에서는 이 명령으로 등록합니다.

```bash
claude mcp add ursula -- npx -y ursula-diagram mcp
```

Claude Desktop에서는 `claude_desktop_config.json`에 이 설정을 넣습니다. 같은 형식을 받는 다른 클라이언트에도 그대로 쓸 수 있습니다.

```json
{ "mcpServers": { "ursula": { "command": "npx", "args": ["-y", "ursula-diagram", "mcp"] } } }
```

# 에이전트 터미널에서

에이전트의 답을 화면에 보여 주는 호스트는 스킬 없이도 직접 그림을 그릴 수 있고, 이때 모델의 차례를 더 쓰지 않습니다.
답 안의 ` ```mermaid ` 블록을 찾아 그 자리에 그림을 넣으면 됩니다. 터미널에서 답을 다시 그리는 Claude Code mod가 이런 호스트의
예입니다. `renderTextSpans`는 줄마다 톤이 붙은 조각을 돌려주고, 톤마다 어떤 색을 쓸지는 호스트가 정합니다.

````ts
import { renderTextSpans } from 'ursula-diagram';

const TONE = { normal: '', dim: '\x1b[2m', bold: '\x1b[1m', accent: '\x1b[33m' };

function drawMermaidBlocks(reply: string, width: number): string {
  return reply.replace(/```mermaid\n([\s\S]*?)```/g, (block, src) => {
    const out = renderTextSpans(src, width);
    if ('error' in out) return block; // 그릴 수 없으면 글을 그대로 둔다
    return out.lines
      .map((line) => line.map((s) => TONE[s.tone] + s.text + '\x1b[0m').join(''))
      .join('\n');
  });
}
````

그림은 `width`를 넘지 않습니다. 폭 안에 들어가지 않으면 `renderTextSpans`가 `{ error }`를 돌려주고, 블록은 Mermaid 글 그대로 남습니다.

