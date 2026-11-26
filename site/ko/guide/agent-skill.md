# 에이전트 스킬

`skills/ursula`는 코딩 에이전트용 스킬입니다. `SKILL.md`는 에이전트에게 Mermaid 글을 쓰는 법, `--format check`로
엔진에 그림을 점검받는 법, 읽는 사람에게 줄 출력을 고르는 법을 알려 줍니다. `scripts/ursula.mjs`는 명령을 한 파일로 묶은
것이어서, 스킬은 Node 22 이상만 있으면 아무것도 설치하지 않고 돌아갑니다.

[skills](https://skills.sh) 명령으로 설치합니다. Claude Code, Codex, Cursor 같은 에이전트에서 쓸 수 있습니다.

```bash
npx skills add yjun1806/ursula-diagram            # 이 프로젝트에
npx skills add yjun1806/ursula-diagram -g         # 모든 프로젝트에
npx skills add yjun1806/ursula-diagram -a claude-code   # 한 에이전트에만
```

`skills/ursula` 폴더를 에이전트의 스킬 폴더에 직접 복사해도 됩니다. 이 폴더는 npm 패키지에도 들어 있습니다.

```bash
cp -R "$(npm root -g)/ursula-diagram/skills/ursula" ~/.claude/skills/
```

스킬을 쓰면 에이전트는 Mermaid 글을 쓰고 `--format check`를 돌린 뒤, 독자가 있는 곳에 맞춰 출력을 고릅니다. 터미널에는
`text`, 채팅이나 웹 페이지에는 `text-svg`, 파일에는 `svg`나 `html`을 줍니다.

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

