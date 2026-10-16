---
type: note
created: 2026-10-01
---

```base
filters:
  and:
    - '!file.inFolder("10 Archive")'
    - 'file.ext == "md"'
views:
  - type: ninja-board-today
    name: Today
```
