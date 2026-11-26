# 로드맵

ursula가 앞으로 지원할 계획입니다. 항목마다 GitHub 이슈가 하나씩 있고, 논의와 진행은 그 이슈에서 합니다. 이 페이지는 이슈를 모아 보여 줍니다. 날짜는 정하지 않습니다. 제안이 있으면 [이슈를 열어 주세요](https://github.com/yjun1806/ursula-diagram/issues/new).

열린 로드맵 항목 전체: [`roadmap` 라벨이 붙은 이슈](https://github.com/yjun1806/ursula-diagram/issues?q=is%3Aissue%20state%3Aopen%20label%3Aroadmap)

## 계획

- Mermaid 스타일 문법(`classDef`, `class`, `style`, `linkStyle`, `:::`, `themeVariables`)을 SVG와 터미널 그림에 적용합니다. 지금은 읽기만 하고 무시합니다. [#24](https://github.com/yjun1806/ursula-diagram/issues/24)
- Mermaid 블록을 빌드할 때 그림으로 바꾸는 문서 빌드 플러그인을 만듭니다. markdown-it(VitePress)용과 remark/rehype(Docusaurus, Astro, Next.js MDX)용입니다. [#26](https://github.com/yjun1806/ursula-diagram/issues/26)
- 풀 리퀘스트와 README의 Mermaid를 그림으로 그리는 GitHub Action을 만듭니다. [#27](https://github.com/yjun1806/ursula-diagram/issues/27)
- Mermaid 문서의 예제를 정기적으로 그려 보고, 그리지 못한 예제가 있으면 이슈를 여는 작업을 둡니다. [#28](https://github.com/yjun1806/ursula-diagram/issues/28)
- 에이전트가 쓰고 고치는 과정을 한 번 더 줄입니다. 에이전트가 자주 하는 실수를 `--fix`가 더 많이 고치고, `--check`가 SVG 배치가 아니라 터미널 그림의 교차와 꺾임을 직접 셉니다. [#29](https://github.com/yjun1806/ursula-diagram/issues/29)
- 터미널 그림을 다듬습니다. 상자 폭을 각자의 글자에 맞추고, 이모지를 두 칸으로 세고, 80칸의 C4 예제와 use case의 행위자 열에서도 화살촉이 나란히 붙지 않게 합니다. [#30](https://github.com/yjun1806/ursula-diagram/issues/30)
- `monochrome`, `blueprint` 같은 테마 프리셋을 CSS 변수 묶음으로 제공합니다. [#31](https://github.com/yjun1806/ursula-diagram/issues/31)

## 진행 중

지금은 없습니다.

## 최근에 나온 것

버전별 전체 내용: [릴리스](https://github.com/yjun1806/ursula-diagram/releases)

### 0.2.1 (2026-11-26)

- `--version`과 `-v`가 버전을 출력합니다. [#61](https://github.com/yjun1806/ursula-diagram/pull/61)

### 0.2.0 (2026-11-26)

- `--format png`로 PNG를 저장합니다. 렌더러는 선택 설치라서 기본 설치의 실행 의존성은 0개로 남고, PNG마다 필요한 글꼴 파일만 읽습니다. [#46](https://github.com/yjun1806/ursula-diagram/pull/46), [#58](https://github.com/yjun1806/ursula-diagram/pull/58)
- 에이전트가 쓰고 고치는 과정을 줄였습니다. MCP 서버, `syntax`, `--check`와 종료 코드, 틀린 헤더·키워드를 고치는 `--fix`를 더했고, 스킬 안내를 17% 줄여 그리기에 성공한 그림을 다시 확인하지 않게 했습니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5), [#13](https://github.com/yjun1806/ursula-diagram/pull/13), [#49](https://github.com/yjun1806/ursula-diagram/pull/49)
- 터미널 상자의 모서리를 둥글게 하고, 나란한 화살촉을 띄웁니다. [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
- 둥근 상자로 늘어난 터미널 그림 시간을 대부분 되찾았습니다. [#39](https://github.com/yjun1806/ursula-diagram/pull/39), [#41](https://github.com/yjun1806/ursula-diagram/pull/41), [#43](https://github.com/yjun1806/ursula-diagram/pull/43), [#45](https://github.com/yjun1806/ursula-diagram/pull/45), [#48](https://github.com/yjun1806/ursula-diagram/pull/48), [#50](https://github.com/yjun1806/ursula-diagram/pull/50)
- `--color`가 모든 다이어그램 종류의 터미널 그림에 색을 입힙니다. [#44](https://github.com/yjun1806/ursula-diagram/pull/44), [#52](https://github.com/yjun1806/ursula-diagram/pull/52)
- 작업이 없는 Gantt 차트를 빈 틀로 그려서, Mermaid 문서의 예제 531개를 모두 그립니다. [#4](https://github.com/yjun1806/ursula-diagram/pull/4)
- 예제 페이지에 그 531개를 싣고, 각각을 SVG와 터미널 그림 탭으로 보여 줍니다. [#8](https://github.com/yjun1806/ursula-diagram/pull/8), [#11](https://github.com/yjun1806/ursula-diagram/pull/11)
- 문서에 나오는 그림·오류·명령 출력을 빌드할 때 빌드된 명령으로 만듭니다. [#51](https://github.com/yjun1806/ursula-diagram/pull/51)
- 비교 페이지의 수치를 낸 벤치마크를 명령 하나로 다시 돌릴 수 있게 공개했습니다. [#42](https://github.com/yjun1806/ursula-diagram/pull/42)

## 계획하지 않는 것

- Mermaid에 없는 ursula만의 문법. 에이전트가 쓴 글이 Mermaid와 GitHub에서도 그대로 그려지도록 ursula는 Mermaid만 읽습니다.
- 상자를 끌어 옮기는 편집기. ursula는 에이전트가 쓴 글을 그립니다. 고칠 것이 있으면 글을 고칩니다.
