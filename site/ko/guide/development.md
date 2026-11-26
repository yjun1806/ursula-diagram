# 개발

저장소에는 엔진(`src/`), 그 시험(`test/`), 에이전트 스킬(`skills/ursula`), 이 사이트(`site/`)가 있습니다. 릴리스 절차는
[RELEASING.md](https://github.com/yjun1806/ursula-diagram/blob/main/RELEASING.md)에 있습니다.

의존성을 설치합니다.

```bash
npm install
```

타입을 검사합니다.

```bash
npx tsc --noEmit
```

느린 대조를 뺀 시험 전체를 돌립니다.

```bash
npm test
```

층 배치 엔진의 느린 대조를 돌립니다. 15분쯤 걸립니다.

```bash
npm run test:rewrite
```

`dist/`와 스킬 안의 명령을 만듭니다. 그림이 바뀌면 다시 돌립니다.

```bash
bun scripts/build.ts
```

그림을 바꾸는 빌드를 했으면 README와 `assets/`에 파일로 둔 출력을 다시 그립니다. 이 출력이 빌드한 명령의 출력과 다르면
`npm test`가 실패합니다.

```bash
npm run docs:sync
```

사이트는 빌드할 때 출력을 직접 그립니다. 방금 만든 `dist/`로 문서 사이트와 플레이그라운드를 띄웁니다.

```bash
cd site && npm install && npm run dev
```

엔진을 바꾸는 풀 리퀘스트를 열기 전에 공식 예시의 그림을 `main`과 비교합니다. 출력된 내용을 풀 리퀘스트에 붙입니다.

```bash
npm run compare
```

풀 리퀘스트 템플릿이 이 출력을 묻습니다.
[`.claude/skills/ursula-dev/`](https://github.com/yjun1806/ursula-diagram/tree/main/.claude/skills/ursula-dev)의 기여자
스킬은 사람이나 에이전트에게 소스 구조, 시험, 풀 리퀘스트 절차를 안내합니다.

빌드한 파일은 Node 22 이상에서 돕니다. 저장소를 받은 폴더에서는 Node 24 이상이 소스를 바로 실행합니다:
`node src/cli.ts order.mmd --format text`.
