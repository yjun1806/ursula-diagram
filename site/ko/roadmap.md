# 로드맵

ursula가 앞으로 지원할 계획입니다. 항목마다 GitHub 이슈가 하나씩 있고, 논의와 진행은 그 이슈에서 합니다. 이 페이지는 이슈를 모아 보여 줍니다. 날짜는 정하지 않습니다. 제안이 있으면 [이슈를 열어 주세요](https://github.com/yjun1806/ursula-diagram/issues/new).

열린 로드맵 항목 전체: [`roadmap` 라벨이 붙은 이슈](https://github.com/yjun1806/ursula-diagram/issues?q=is%3Aissue%20state%3Aopen%20label%3Aroadmap)

## 계획

### 기능

- Mermaid 스타일 문법(`classDef`, `class`, `style`, `linkStyle`, `:::`, `themeVariables`)을 SVG와 터미널 그림에 적용합니다. 지금은 읽기만 하고 무시합니다. [#24](https://github.com/yjun1806/ursula-diagram/issues/24)
- 클래스 이름 바로 뒤에 화살표가 붙은 `A:::hot-->B`를 고칩니다. Mermaid는 받아들이지만 ursula는 오류를 냅니다. [#25](https://github.com/yjun1806/ursula-diagram/issues/25)
- Mermaid 블록을 빌드할 때 그림으로 바꾸는 문서 빌드 플러그인을 만듭니다. markdown-it(VitePress)용과 remark/rehype(Docusaurus, Astro, Next.js MDX)용입니다. [#26](https://github.com/yjun1806/ursula-diagram/issues/26)
- 풀 리퀘스트와 README의 Mermaid를 그림으로 그리는 GitHub Action을 만듭니다. [#27](https://github.com/yjun1806/ursula-diagram/issues/27)
- Mermaid 문서의 예제를 정기적으로 그려 보고, 그리지 못한 예제가 있으면 이슈를 여는 작업을 둡니다. [#28](https://github.com/yjun1806/ursula-diagram/issues/28)
- 에이전트가 쓰고 고치는 과정을 줄입니다. `--fix`가 고치는 범위를 넓히고, 스킬 안내를 줄이고, 검사가 터미널 그림의 교차와 꺾임을 직접 셉니다. [#29](https://github.com/yjun1806/ursula-diagram/issues/29)
- 터미널 그림을 다듬습니다. 상자 폭을 글자에 맞추고, 화살촉과 선이 붙지 않게 하고, 이모지를 두 칸으로 셉니다. [#30](https://github.com/yjun1806/ursula-diagram/issues/30)
- `monochrome`, `blueprint` 같은 테마 프리셋을 CSS 변수 묶음으로 제공합니다. [#31](https://github.com/yjun1806/ursula-diagram/issues/31)

### 그림 품질

- SVG에서 굵은 링크(`==>`)를 보통 링크보다 굵게 그리고, 범례도 링크 종류마다 제 선 모양으로 보여 줍니다. [#34](https://github.com/yjun1806/ursula-diagram/issues/34)
- C4 상자의 태그에 `ContainerDb_Ext` 같은 매크로 이름 대신 읽을 수 있는 종류(「Database, external」)를 씁니다. [#35](https://github.com/yjun1806/ursula-diagram/issues/35)
- ER처럼 넓은 SVG 그림을 칸 폭에 맞춰 줄여도 글자를 읽을 수 있게 합니다. [#36](https://github.com/yjun1806/ursula-diagram/issues/36)
- 터미널에서 flowchart의 subgraph를 묶음 상자로 그립니다. `101-flowcharts`에서는 지금 머리줄 한 줄로만 나옵니다. [#37](https://github.com/yjun1806/ursula-diagram/issues/37)
- `--color`를 주면 flowchart에도 색 코드를 넣습니다. sequence는 이미 넣습니다. [#38](https://github.com/yjun1806/ursula-diagram/issues/38)

## 진행 중

- 명령에서 PNG를 바로 저장합니다. 렌더러는 선택 설치라서 기본 설치의 실행 의존성은 0개로 남습니다. [#32](https://github.com/yjun1806/ursula-diagram/issues/32)
- 터미널 그림을 그리는 속도를 되찾습니다. [#33](https://github.com/yjun1806/ursula-diagram/issues/33)

## 최근에 나온 것

- 터미널 상자의 모서리를 둥글게 하고, 나란한 화살촉을 띄웁니다. [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
- `--fix`가 틀린 헤더·키워드와 flowchart의 `->`를 고칩니다. [#13](https://github.com/yjun1806/ursula-diagram/pull/13)
- 사이트의 모든 예제를 SVG와 터미널 그림 탭으로 보여 줍니다. [#11](https://github.com/yjun1806/ursula-diagram/pull/11)
- Mermaid 문서의 예제 531개를 예제 페이지에 모두 실었습니다. [#8](https://github.com/yjun1806/ursula-diagram/pull/8)
- 버전을 올린 풀 리퀘스트를 병합하면 npm에 배포합니다. [#6](https://github.com/yjun1806/ursula-diagram/pull/6)
- MCP 서버, `syntax` 명령, `--help`, `--check`, 구분된 종료 코드를 더했습니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- 작업이 없는 Gantt 차트를 빈 틀로 그립니다. [#4](https://github.com/yjun1806/ursula-diagram/pull/4)

## 계획하지 않는 것

- Mermaid에 없는 ursula만의 문법. 에이전트가 쓴 글이 Mermaid와 GitHub에서도 그대로 그려지도록 ursula는 Mermaid만 읽습니다.
- 상자를 끌어 옮기는 편집기. ursula는 에이전트가 쓴 글을 그립니다. 고칠 것이 있으면 글을 고칩니다.
