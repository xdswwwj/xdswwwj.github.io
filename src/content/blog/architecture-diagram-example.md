---
title: 'Mermaid로 아키텍처 그리기 (예시)'
description: '마크다운 안에서 코드로 다이어그램을 그리는 방법 — 참고용 예시 글입니다.'
pubDate: 'Jun 28 2026'
category: '아키텍처'
---

글 안에서 ` ```mermaid ` 코드블록을 쓰면 다이어그램으로 렌더링됩니다. 이미지가 아니라 텍스트라서 글과 함께 git으로 관리되고, 화살표 하나 고칠 때 텍스트만 수정하면 됩니다.

## 시스템 구성도 (flowchart)

```mermaid
graph LR
    Client[React / TS] --> ALB[AWS ALB]
    ALB --> Django[Django API]
    Django --> DB[(PostgreSQL)]
    Django --> Cache[(Redis)]
```

## 요청 흐름 (sequence)

```mermaid
sequenceDiagram
    participant U as 사용자
    participant F as Frontend
    participant A as API
    participant D as DB
    U->>F: 주문 생성
    F->>A: POST /orders
    A->>D: INSERT order
    D-->>A: ok
    A-->>F: 201 Created
    F-->>U: 완료 표시
```

이 예시 글은 문법 참고용이니, 익숙해지면 지우거나 네 글로 바꾸면 됩니다.
