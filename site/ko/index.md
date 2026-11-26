---
title: 'ursula-diagram: 브라우저 없이 Mermaid를 SVG와 터미널 그림으로'
titleTemplate: false
description: 'ursula-diagram은 브라우저 없이 Mermaid를 SVG와 터미널 글자 그림으로 그리는 Mermaid CLI이자 라이브러리입니다. 오류가 고치는 법을 알려 주어 AI 코딩 에이전트가 스스로 고칩니다.'
layout: home

hero:
  name: ursula-diagram
  text: 코딩 에이전트가 그리는 다이어그램
  tagline: Mermaid 글을 넣으면 SVG와 터미널 글자 그림이 나옵니다. 오류가 고칠 자리와 고치는 법을 알려 주므로 에이전트가 사람 없이 고쳐 다시 그립니다. 같은 글에서는 언제나 같은 그림이 나옵니다.
  actions:
    - theme: brand
      text: 빠른 시작
      link: /ko/guide/quick-start
    - theme: alt
      text: 에이전트 스킬
      link: /ko/guide/agent-skill
    - theme: alt
      text: 플레이그라운드
      link: /ko/playground
    - theme: alt
      text: GitHub
      link: https://github.com/yjun1806/ursula-diagram
---

<AgentCards />

<TypeGrid />

<div class="home-prose">

## 하는 일

ursula-diagram은 코딩 에이전트가 쓰도록 만든 다이어그램 도구입니다. Mermaid 문서에 있는 35가지 유형의 글을 읽고 상자·선·라벨의
자리를 직접 계산합니다. 에이전트가 Mermaid 글 몇 줄을 쓰면 엔진이 배치를 계산해 SVG나 터미널 글자 그림으로 그립니다.
SVG 한 장은 중앙값 0.36ms에 그립니다. 같은 글에서는 언제나 같은 그림이 나옵니다. Node만 있으면 돌아가고 브라우저나 DOM은
필요 없으며, 실행할 때 따로 설치할 것도 없습니다.

이 페이지 맨 위에 그런 글 하나와 ursula가 그 글로 그린 그림을 실었습니다. 그림은 손대지 않았습니다. SVG는 `--format svg`로,
터미널 글자 그림은 `--format text --width 80`으로 그렸습니다(좁은 화면에서는 `--width 40`). 이 문서의 글자 그림은 모두 영문으로 그렸고,
그 까닭은 [줄이 맞지 않을 때](/ko/guide/terminal#줄이-맞지-않을-때)에 적었습니다. 직접 쓴 글은 [플레이그라운드](/ko/playground)에서 그려 볼 수 있습니다.

</div>
