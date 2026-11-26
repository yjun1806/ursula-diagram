# 변경 내역

`ursula-diagram` 패키지가 버전마다 무엇이 바뀌었는지 적습니다. 명령, 라이브러리, 에이전트 스킬, MCP 서버가 대상입니다.
문서 사이트는 병합할 때마다 바뀌므로 여기에 적지 않습니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를,
버전은 [유의적 버전](https://semver.org/lang/ko/)을 따릅니다. 앞으로 할 일은 [로드맵](https://yjun1806.github.io/ursula-diagram/ko/roadmap)에 있습니다.

## Unreleased

### Changed

- class diagram의 json이 svg처럼 `maxWidth`, `composition`, `quality`를 받고, requirement diagram의 json이 `quality`를 받습니다. 그래서 `--check`가 그려진 배치를 설명합니다. [#72](https://github.com/yjun1806/ursula-diagram/pull/72)

### Removed

- 둘째 flowchart 배치 엔진을 지웠습니다. `--engine` 옵션, 라이브러리의 `engine` 옵션(`LayoutOptions`, `RenderOptions`, `TextOptions`, `renderText`, `renderTextSpans`, `renderTextSvg`), 그 엔진만 읽던 `LayoutOptions`의 `laneAxis` 옵션이 없어졌습니다. 그림은 하나도 바뀌지 않습니다. [#70](https://github.com/yjun1806/ursula-diagram/pull/70)
- `--no-questions`와 `--no-elbows` 옵션, 라이브러리의 `questions`와 `elbows` 옵션(`RenderOptions`, `TextOptions`, `LayoutOptions`, renderText 계열)을 지웠습니다. [#72](https://github.com/yjun1806/ursula-diagram/pull/72)

## 0.2.1 (2026-11-26)

### Fixed

- `--version`과 `-v`가 버전을 출력합니다. [#61](https://github.com/yjun1806/ursula-diagram/pull/61)

## 0.2.0 (2026-11-26)

### Added

- `--format png`로 PNG를 저장합니다. 렌더러 `@resvg/resvg-js`는 선택 설치라서 기본 설치의 실행 의존성은 0개로 남습니다. [#46](https://github.com/yjun1806/ursula-diagram/pull/46)
- `ursula-diagram mcp`는 `render`, `check`, `syntax` 도구를 가진 MCP 서버입니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `ursula-diagram syntax [type]`이 다이어그램 종류의 짧은 예제와 규칙을 출력합니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `--check`는 어떤 그림 형식과도 함께 쓸 수 있고 점검 결과를 stderr에 출력합니다. `--format check`는 교차하는 선을 원문 줄 번호와 함께 알려 줍니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- 종료 코드를 정했습니다. 0은 그림, 1은 글 오류, 2는 사용법 오류, 3은 폭 부족, 4는 엔진 실패입니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `--fix`와 `--format fixed`가 틀린 헤더·키워드와 flowchart의 `->`를 고칩니다. 라이브러리에는 `fixSource`가 생겼습니다. [#13](https://github.com/yjun1806/ursula-diagram/pull/13)
- `--color`가 flowchart, class, state, ER, requirement, C4, use case, architecture의 터미널 그림에도 색을 입힙니다. [#44](https://github.com/yjun1806/ursula-diagram/pull/44), [#52](https://github.com/yjun1806/ursula-diagram/pull/52)

### Changed

- 오류가 원문 줄과 열 위치의 `^`, `did you mean`, 힌트, 예제를 함께 보여 줍니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `--width`를 준 `text`와 `text-svg`는 폭을 넘겨 출력하지 않습니다. 종료 코드 3과 함께 들어가는 폭을 알려 줍니다. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- 터미널 상자의 모서리가 둥글고, 나란한 화살촉이 떨어져 그려집니다. [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
- 터미널 그림이 빨라져서 둥근 상자로 늘어난 시간을 대부분 되찾았습니다. [#39](https://github.com/yjun1806/ursula-diagram/pull/39), [#41](https://github.com/yjun1806/ursula-diagram/pull/41), [#43](https://github.com/yjun1806/ursula-diagram/pull/43), [#45](https://github.com/yjun1806/ursula-diagram/pull/45), [#48](https://github.com/yjun1806/ursula-diagram/pull/48), [#50](https://github.com/yjun1806/ursula-diagram/pull/50)
- C4의 태그와 경계가 매크로 이름 대신 말로 나옵니다(`Database · external`, `System boundary`). [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- 왼쪽에서 오른쪽으로 놓은 ER 그림이 너무 넓으면, 아래로 놓는 쪽이 더 좁을 때 아래로 놓습니다. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- 에이전트 스킬 안내가 17% 짧아졌고, 종료 코드 0으로 그린 그림은 다시 확인하지 않아도 된다고 알려 줍니다. [#49](https://github.com/yjun1806/ursula-diagram/pull/49)
- PNG는 필요한 글꼴 파일만 읽고, 글꼴이 없으면 명령이 경고합니다. [#58](https://github.com/yjun1806/ursula-diagram/pull/58)

### Fixed

- 작업이 없는 Gantt 차트를 빈 틀로 그려서, Mermaid 문서의 예제 531개를 모두 그립니다. [#4](https://github.com/yjun1806/ursula-diagram/pull/4)
- `A:::hot-->B`를 읽습니다. 전에는 `:::`가 화살표 앞의 하이픈까지 이름으로 가져갔습니다. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- 굵은 링크(`==>`)가 SVG에서 굵게 그려집니다. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- 터미널 그림에서 나란히 선 subgraph 열 사이에 점선을 그어 나눕니다. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- 점검 결과가 sequence 다이어그램의 노트를 `note: [object Object]`로 출력하지 않습니다. [#54](https://github.com/yjun1806/ursula-diagram/pull/54)

## 0.1.1 (2026-11-25)

### Added

- 명령이 `ursula-diagram`이라는 이름으로도 설치되어 `npx ursula-diagram`이 동작합니다.

### Changed

- CI에서 npm provenance와 함께 배포합니다. 패키지 정보에 저장소와 이슈 주소가 들어갑니다.

## 0.1.0 (2026-11-25)

### Added

- Mermaid 다이어그램 35종을 인라인 SVG와 터미널 글자 그림으로 그립니다. 브라우저도, 실행 의존성도 필요 없습니다.
- 터미널 그림을 ASCII만으로(`--charset ascii`) 그리거나, 칸을 유지한 SVG로(`--format text-svg`) 그립니다.
- 에이전트 스킬(`skills/ursula`)이 명령을 파일 하나로 담고 있습니다.
