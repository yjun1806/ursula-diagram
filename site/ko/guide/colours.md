# 색 바꾸기

SVG 그림은 모든 색을 CSS 변수에서 읽고 기본값도 함께 담습니다. 그래서 그림만 넣어도 제 색으로 보이고, 페이지가 변수를
정하면 그 색을 따릅니다. 변수마다 밝은 값과 어두운 값이 있고, 어두운 값은 `prefers-color-scheme: dark`에서 씁니다.

```css
:root {
  --ursula-accent: #0b6e4f;
  --ursula-start-fill: #bfe3d0;
}
```

<ColourTable />

