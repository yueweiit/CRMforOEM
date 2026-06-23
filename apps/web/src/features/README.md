# Features Directory

This directory owns business-domain frontend modules.

## Rules

- Route entry pages may live here once migrated.
- Feature-local components stay inside the feature.
- Feature-local shared helpers go under `shared/` inside that feature.
- Promote code to `src/components` or `src/shared` only when reused by two or more business domains.
- Do not import from another feature's internal folders.

## Directory Convention

```
features/<domain>/
  <DomainPage>.tsx
  components/
  panels/
  hooks/
  types.ts
  utils.ts
```

## Boundary Summary

| Directory | Belongs here | Does NOT belong here |
|---|---|---|
| `features/` | Business pages, panels, local components, local types | Cross-feature UI, API client, shared utils |
| `components/` | Cross-business UI primitives (Field, EmptyState, BarList, etc.) | Business tables, business forms, feature panels |
| `shared/` | Cross-feature frontend utils and types | Business API paths, page state |
| `api/` | Named API functions per domain; low-level HTTP client only in `api/http.ts` | UI components, business state |
| `app/` | Router, global providers, app initialization | Business components, API calls |
| `@oem-crm/shared` | Cross-stack domain contracts (enums, labels, constants) | React types, UI props, form state |
