---
name: "api-integration-testing"
description: "Patterns for testing API integrations"
domain: "testing"
confidence: "medium"
source: "manual"
tools:
  - name: "powershell"
    description: "Run test commands"
  - name: "grep"
    description: "Search for test patterns"
  - name: "view"
    description: "Read test files"
  - name: "web_fetch"
    description: "Fetch API documentation"
---

# API Integration Testing

## Context

Use when testing APIs.

## Patterns

Write tests for API endpoints. Check status codes.

## Examples

Run the test suite:

```bash
npm test
```

## Anti-Patterns

Skip tests.
