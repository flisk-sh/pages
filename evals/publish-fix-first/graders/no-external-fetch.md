---
type: regex
pattern: 'metrics\.internal\.example|cdn\.example-charts\.io'
match: not_contains
target: { source: file, path: leaky-dashboard/index.html }
---
