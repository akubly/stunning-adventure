---
name: "react-component-patterns"
description: "Patterns for building React components that might be useful in various situations"
domain: "frontend"
confidence: "medium"
source: "manual"
tools:
  - name: "grep"
    description: "Search for component patterns"
  - name: "view"
    description: "Read component files"
---

# React Component Patterns

## Context

This skill could potentially be useful when you are working on React components and you might want to consider applying some of the patterns described below if they seem applicable to your particular situation and if you think they would be appropriate for the codebase you are currently working in.

Components are generally structured in a way that is considered to be a best practice by many developers, although there are different opinions on the matter and you should perhaps consider the specific needs of your project before making any decisions about which patterns to follow.

## Patterns

You might want to consider using functional components instead of class components because functional components are generally considered to be somewhat simpler and they could potentially be easier to understand and maintain, although this is not always the case and there are situations where class components might be more appropriate depending on the specific requirements of your application and the preferences of your team.

Props should probably be defined using TypeScript interfaces, and it is generally recommended that you consider using readonly modifiers where it seems like it would be appropriate, though this is really a matter of preference and there are valid arguments for and against this approach depending on the context.

State management is typically handled by hooks in modern React applications, and you might want to consider using useState for simple state and useReducer for more complex state management scenarios, although the choice between these two approaches could depend on various factors that are specific to your situation.

It might be considered a good practice to perhaps extract reusable logic into custom hooks when applicable, as this could potentially help with code organization and reusability, though the decision to do so should be made on a case-by-case basis.

Error boundaries are sometimes used to catch rendering errors, and they are typically implemented using class components since the componentDidCatch lifecycle method is not available in functional components as of now.

## Examples

Components are usually structured as follows, though the exact structure might vary depending on the project:

```tsx
const MyComponent = (props: Props) => {
  return <div>{props.children}</div>;
};
```

## Anti-Patterns

Tests should be written for all components. Errors are handled by wrapping components in error boundaries. State is managed by using the appropriate hooks. Props are validated by using TypeScript types.
