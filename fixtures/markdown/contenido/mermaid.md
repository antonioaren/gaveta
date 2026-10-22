---
title: Diagramas Mermaid
tags:
  - mermaid
---

# Diagramas Mermaid

```mermaid
flowchart LR
  md[Markdown] --> html[HTML Gaveta]
  html --> md
```

```mermaid
sequenceDiagram
  participant U as Usuario
  participant G as gaveta import
  U->>G: carpeta .md
  G-->>U: notas validadas
```

[[Índice del vault]]
