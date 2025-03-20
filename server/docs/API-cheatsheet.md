# API Endpoints Cheatsheet

## Authentication

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/auth/register` | `POST` | No | Register new user | `username`, `email`, `password` |
| `/api/auth/login` | `POST` | No | Log in user | `email`, `password` |
| `/api/auth/refresh` | `POST` | No | Refresh token | `token` |

## User Management

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/users/me` | `GET` | Yes | Get current user profile | - |
| `/api/users/me` | `PUT` | Yes | Update current user | `username`, `email`, `password`, etc. |

## Domains

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/domains` | `GET` | Yes | Get all domains | - |
| `/api/domains/public` | `GET` | No | Get public domains | - |
| `/api/domains/my` | `GET` | Yes | Get my domains | - |
| `/api/domains/enrolled` | `GET` | Yes | Get enrolled domains | - |
| `/api/domains` | `POST` | Yes | Create domain | `name`, `privacy`, `description` |
| `/api/domains/:id` | `GET` | Yes | Get domain by ID | - |
| `/api/domains/:id` | `PUT` | Yes | Update domain | `name`, `privacy`, etc. |
| `/api/domains/:id` | `DELETE` | Yes | Delete domain | - |
| `/api/domains/:id/enroll` | `POST` | Yes | Enroll in domain | - |
| `/api/domains/:id/comments` | `GET` | Yes | Get domain comments | - |
| `/api/domains/:id/comments` | `POST` | Yes | Add domain comment | `content` |

## Definitions

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/domains/:id/definitions` | `GET` | Yes | Get domain definitions | - |
| `/api/domains/:id/definitions` | `POST` | Yes | Create definition | `code`, `name`, `description` |
| `/api/definitions/:id` | `GET` | Yes | Get definition by ID | - |
| `/api/definitions/:id` | `PUT` | Yes | Update definition | `code`, `name`, etc. |
| `/api/definitions/:id` | `DELETE` | Yes | Delete definition | - |
| `/api/definitions/code/:code` | `GET` | Yes | Get definition by code | - |

## Exercises

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/domains/:id/exercises` | `GET` | Yes | Get domain exercises | - |
| `/api/domains/:id/exercises` | `POST` | Yes | Create exercise | `code`, `name`, `statement` |
| `/api/exercises/:id` | `GET` | Yes | Get exercise by ID | - |
| `/api/exercises/:id` | `PUT` | Yes | Update exercise | `code`, `name`, etc. |
| `/api/exercises/:id` | `DELETE` | Yes | Delete exercise | - |
| `/api/exercises/code/:code` | `GET` | Yes | Get exercise by code | - |
| `/api/exercises/:id/verify` | `POST` | Yes | Verify exercise answer | `answer` |

## Progress Tracking

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/progress/domains` | `GET` | Yes | Get domain progress | - |
| `/api/progress/domains/:domainId/definitions` | `GET` | Yes | Get definition progress | - |
| `/api/progress/domains/:domainId/exercises` | `GET` | Yes | Get exercise progress | - |
| `/api/progress/definitions/:id/review` | `POST` | Yes | Submit definition review | `result`, `timeTaken` |
| `/api/progress/exercises/:id/attempt` | `POST` | Yes | Submit exercise attempt | `answer`, `timeTaken` |
| `/api/progress/domains/:domainId/review` | `GET` | Yes | Get definitions for review | - |

## Study Sessions

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/sessions/start` | `POST` | Yes | Start study session | `domainId` |
| `/api/sessions/:id/end` | `PUT` | Yes | End study session | - |
| `/api/sessions` | `GET` | Yes | Get all sessions | - |
| `/api/sessions/:id` | `GET` | Yes | Get session details | - |

## Knowledge Graph

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/domains/:id/graph` | `GET` | Yes | Get visual graph | - |
| `/api/domains/:id/graph/positions` | `PUT` | Yes | Update graph positions | `{nodeId: {x, y}}` |
| `/api/domains/:id/export` | `GET` | Yes | Export domain | - |
| `/api/domains/:id/import` | `POST` | Yes | Import domain | `definitions`, `exercises` |

## Authentication Header Format

For all authenticated requests, include:
```
Authorization: Bearer your_jwt_token
```

## Common Response Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
