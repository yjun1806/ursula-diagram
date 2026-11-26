// The agent's loop on the home page, as Mermaid text. scripts/render-loop.mjs draws it with this checkout's engine at
// build time into public/assets/loop.svg and public/assets/ko-loop.svg.

export const LOOP = {
  en: `flowchart LR
  write[Write Mermaid] --> draw[Draw and check]
  draw -->|drawn| done([Show the drawing])
  draw -->|error| fix[Read what to fix]
  fix -->|write again| write`,
  ko: `flowchart LR
  write[Mermaid 쓰기] --> draw[그려서 점검]
  draw -->|그려짐| done([그림 보여 주기])
  draw -->|오류| fix[고칠 곳 읽기]
  fix -->|다시 쓰기| write`,
};
