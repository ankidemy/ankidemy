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

## Advanced SRS (Spaced Repetition System)

### Review Management

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/srs/reviews` | `POST` | Yes | Submit review (explicit) | `nodeId`, `nodeType`, `success`, `quality` |
| `/api/srs/domains/:domainId/due` | `GET` | Yes | Get due reviews | Query: `type` (definition\|exercise\|mixed) |
| `/api/srs/reviews/history` | `GET` | Yes | Get review history | Query: `nodeId`, `nodeType`, `limit` |

### Progress & Statistics

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/srs/domains/:domainId/progress` | `GET` | Yes | Get domain progress | - |
| `/api/srs/domains/:domainId/stats` | `GET` | Yes | Get domain statistics | - |
| `/api/srs/nodes/status` | `PUT` | Yes | Update node status | `nodeId`, `nodeType`, `status` |

### SRS Study Sessions

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/srs/sessions` | `POST` | Yes | Start SRS session | `domainId`, `sessionType` |
| `/api/srs/sessions/:sessionId/end` | `PUT` | Yes | End SRS session | - |
| `/api/srs/sessions` | `GET` | Yes | Get user SRS sessions | Query: `limit` |

### Prerequisites Management

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/srs/prerequisites` | `POST` | Yes | Create prerequisite | `nodeId`, `nodeType`, `prerequisiteId`, `weight` |
| `/api/srs/domains/:domainId/prerequisites` | `GET` | Yes | Get domain prerequisites | - |
| `/api/srs/prerequisites/:prerequisiteId` | `DELETE` | Yes | Delete prerequisite | - |

### Test/Debug

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/srs/test/credit-propagation` | `POST` | Yes | Test credit propagation | `domainId`, `nodeId`, `nodeType`, `success` |

## Legacy Progress Tracking

### Progress Management

| Endpoint | Method | Auth Required | Description | Key Request Fields |
|----------|--------|---------------|-------------|-------------------|
| `/api/progress/domains` | `GET` | Yes | Get domain progress | - |
| `/api/progress/domains/:domainId/definitions` | `GET` | Yes | Get definition progress | - |
| `/api/progress/domains/:domainId/exercises` | `GET` | Yes | Get exercise progress | - |
| `/api/progress/definitions/:id/review` | `POST` | Yes | Submit definition review | `result`, `timeTaken` |
| `/api/progress/exercises/:id/attempt` | `POST` | Yes | Submit exercise attempt | `answer`, `timeTaken` |
| `/api/progress/domains/:domainId/review` | `GET` | Yes | Get definitions for review | Query: `limit` |

### Legacy Study Sessions

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

## SRS System Quick Reference

### Node Statuses
- **fresh**: Never studied (default)
- **tackling**: Currently learning
- **grasped**: Understood, in spaced repetition
- **learned**: Mastered (optional)

### Quality Ratings (0-5)
- `0`: Complete failure
- `1`: Incorrect with serious difficulty  
- `2`: Incorrect but familiar
- `3`: Correct with serious difficulty
- `4`: Correct after hesitation
- `5`: Perfect recall

### Review Types
- **Explicit**: Direct user review with quality rating
- **Implicit**: Automatic through credit propagation

### Credit Propagation
- Successful reviews → positive credits to prerequisites
- Failed reviews → negative credits to dependents
- +100% credit → review postponed
- -100% credit → review anticipated

### Session Types
- **definition**: Review definitions only
- **exercise**: Review exercises only  
- **mixed**: Review both definitions and exercises

## System Architecture

### Two Learning Systems
1. **Legacy Progress System** (`/api/progress/*`, `/api/sessions/*`)
   - Simple progress tracking
   - Basic Anki-style spaced repetition
   - Session management

2. **Advanced SRS System** (`/api/srs/*`)
   - Sophisticated learning with credit propagation
   - Status management with automatic propagation
   - Optimized review scheduling
   - Advanced analytics and statistics

### Prerequisites System
- Managed via `node_prerequisites` table
- Supports weighted relationships
- Automatic status propagation:
  - **grasped** → propagates to prerequisites
  - **tackling** → propagates to dependents  
  - **fresh** → propagates to dependents (if they were grasped)

## Common Response Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Internal Server Error

## Usage Recommendations

### For Simple Learning Apps
Use Legacy Progress System:
- `/api/progress/*` for basic progress tracking
- `/api/sessions/*` for simple session management

### For Advanced Learning Apps  
Use SRS System:
- `/api/srs/reviews` for sophisticated review submission
- `/api/srs/domains/*/due` for optimized review scheduling
- `/api/srs/nodes/status` for status management
- `/api/srs/domains/*/stats` for detailed analytics

### Prerequisites
- Create during definition/exercise creation with `prerequisiteIds`
- Manage manually with `/api/srs/prerequisites/*`
- Status changes automatically propagate through prerequisite chains

### Best Practices
1. **Start Simple**: Begin with legacy system, upgrade to SRS as needed
2. **Status Management**: Use SRS status updates for automatic propagation
3. **Credit System**: Let SRS handle implicit reviews automatically  
4. **Session Tracking**: Use appropriate session endpoints for your system
5. **Analytics**: Use SRS stats endpoints for detailed learning analytics
