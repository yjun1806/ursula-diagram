# 로드맵

ursula가 앞으로 지원할 계획입니다. 항목마다 GitHub 이슈가 하나씩 있고, 논의와 진행은 그 이슈에서 합니다. 이 페이지는 이슈를 모아 보여 줍니다. 날짜는 정하지 않습니다. 제안이 있으면 [이슈를 열어 주세요](https://github.com/yjun1806/ursula-diagram/issues/new).

열린 로드맵 항목 전체: [`roadmap` 라벨이 붙은 이슈](https://github.com/yjun1806/ursula-diagram/issues?q=is%3Aissue%20state%3Aopen%20label%3Aroadmap)

이미 나온 것은 [변경 내역](/ko/changelog)에 있습니다.

## 계획

- Mermaid 스타일 문법(`classDef`, `class`, `style`, `linkStyle`, `:::`, `themeVariables`)을 SVG와 터미널 그림에 적용합니다. 지금은 읽기만 하고 무시합니다. [#24](https://github.com/yjun1806/ursula-diagram/issues/24)
- Mermaid 블록을 빌드할 때 그림으로 바꾸는 문서 빌드 플러그인을 만듭니다. markdown-it(VitePress)용과 remark/rehype(Docusaurus, Astro, Next.js MDX)용입니다. [#26](https://github.com/yjun1806/ursula-diagram/issues/26)
- 풀 리퀘스트와 README의 Mermaid를 그림으로 그리는 GitHub Action을 만듭니다. [#27](https://github.com/yjun1806/ursula-diagram/issues/27)
- Mermaid 문서의 예제를 정기적으로 그려 보고, 그리지 못한 예제가 있으면 이슈를 여는 작업을 둡니다. [#28](https://github.com/yjun1806/ursula-diagram/issues/28)
- 에이전트가 쓰고 고치는 과정을 줄입니다. [#29](https://github.com/yjun1806/ursula-diagram/issues/29)
  - 에이전트가 자주 하는 실수를 `--fix`가 더 많이 고칩니다.
  - `--check`가 SVG 배치가 아니라 터미널 그림의 교차와 꺾임을 직접 셉니다.
- 터미널 그림을 다듬습니다. [#30](https://github.com/yjun1806/ursula-diagram/issues/30)
  - 상자 폭을 각자의 글자에 맞춥니다.
  - 이모지를 두 칸으로 셉니다.
  - 80칸의 C4 예제와 use case의 행위자 열에서도 화살촉이 나란히 붙지 않게 합니다.
- `monochrome`, `blueprint` 같은 테마 프리셋을 CSS 변수 묶음으로 제공합니다. [#31](https://github.com/yjun1806/ursula-diagram/issues/31)

## 진행 중

지금은 없습니다.

## 계획하지 않는 것

- Mermaid에 없는 ursula만의 문법. 에이전트가 쓴 글이 Mermaid와 GitHub에서도 그대로 그려지도록 ursula는 Mermaid만 읽습니다.
- 상자를 끌어 옮기는 편집기. ursula는 에이전트가 쓴 글을 그립니다. 고칠 것이 있으면 글을 고칩니다.
