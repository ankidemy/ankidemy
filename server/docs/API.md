# API Documentation for Front-End Team

## Overview

This document provides comprehensive information about the backend API endpoints available for the front-end team to interact with. The API follows RESTful principles and uses JWT-based authentication.

The system now includes two learning systems:
1. **Legacy Progress System** - Simple progress tracking with Anki-style spaced repetition
2. **Advanced SRS (Spaced Repetition System)** - Sophisticated learning system with credit propagation, status management, and optimized review scheduling

## Base URL

All API routes are prefixed with `/api`.

## Authentication

The API uses JWT (JSON Web Token) for authentication.

### Authentication Endpoints

#### Register a new user

- **URL**: `/auth/register`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "username": "string (required)",
    "email": "string (required, valid email)",
    "password": "string (required, min 8 characters)",
    "firstName": "string (optional)",
    "lastName": "string (optional)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "token": "jwt_token_string",
    "user": {
      "id": "number",
      "username": "string",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "level": "string",
      "isActive": "boolean",
      "isAdmin": "boolean"
    },
    "expiresAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `409 Conflict`: Email or username already in use

#### Log in

- **URL**: `/auth/login`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "string (required)",
    "password": "string (required)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "token": "jwt_token_string",
    "user": {
      "id": "number",
      "username": "string",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "level": "string",
      "isActive": "boolean",
      "isAdmin": "boolean"
    },
    "expiresAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input format
  - `401 Unauthorized`: Invalid credentials

#### Refresh Token

- **URL**: `/auth/refresh`
- **Method**: `POST`
- **Auth Required**: No (but requires a valid token)
- **Request Body**:
  ```json
  {
    "token": "string (required)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "token": "new_jwt_token_string",
    "user": {
      "id": "number",
      "username": "string",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "level": "string",
      "isActive": "boolean",
      "isAdmin": "boolean"
    },
    "expiresAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input format
  - `401 Unauthorized`: Invalid token

### Using Authentication

For protected endpoints, include the JWT token in the `Authorization` header:

```
Authorization: Bearer your_jwt_token
```

## User Endpoints

### Get Current User

- **URL**: `/users/me`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "username": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "level": "string",
    "isActive": "boolean",
    "isAdmin": "boolean"
  }
  ```

### Update Current User

- **URL**: `/users/me`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "username": "string (optional)",
    "email": "string (optional)",
    "password": "string (optional)",
    "firstName": "string (optional)",
    "lastName": "string (optional)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "username": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "level": "string",
    "isActive": "boolean",
    "isAdmin": "boolean"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `409 Conflict`: Email or username already in use

## Domain Endpoints

Domains represent knowledge areas that contain definitions and exercises.

### Get All Domains

- **URL**: `/domains`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string",
      "privacy": "string (public|private)",
      "ownerId": "number",
      "description": "string",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```

### Get Public Domains

- **URL**: `/domains/public`
- **Method**: `GET`
- **Auth Required**: No
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string",
      "privacy": "public",
      "ownerId": "number",
      "description": "string",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```

### Get My Domains

- **URL**: `/domains/my`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string",
      "privacy": "string (public|private)",
      "ownerId": "number",
      "description": "string",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```

### Get Enrolled Domains

- **URL**: `/domains/enrolled`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string",
      "privacy": "string (public|private)",
      "ownerId": "number",
      "description": "string",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```

### Get Domain by ID

- **URL**: `/domains/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "name": "string",
    "privacy": "string (public|private)",
    "ownerId": "number",
    "description": "string",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Domain not found
  - `403 Forbidden`: Not authorized to access this domain

### Create Domain

- **URL**: `/domains`
- **Method**: `POST`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "name": "string (required)",
    "privacy": "string (required, public|private)",
    "description": "string (optional)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "name": "string",
    "privacy": "string (public|private)",
    "ownerId": "number",
    "description": "string",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data

### Update Domain

- **URL**: `/domains/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "name": "string (optional)",
    "privacy": "string (optional, public|private)",
    "description": "string (optional)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "name": "string",
    "privacy": "string (public|private)",
    "ownerId": "number",
    "description": "string",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `403 Forbidden`: Not authorized to update this domain
  - `404 Not Found`: Domain not found

### Delete Domain

- **URL**: `/domains/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Domain deleted successfully"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to delete this domain
  - `404 Not Found`: Domain not found

### Enroll in Domain

- **URL**: `/domains/:id/enroll`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Enrolled in domain successfully"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

### Domain Comments

#### Get Domain Comments

- **URL**: `/domains/:id/comments`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "content": "string",
      "domainId": "number",
      "userId": "number",
      "createdAt": "timestamp"
    }
  ]
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

#### Add Domain Comment

- **URL**: `/domains/:id/comments`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "content": "string (required)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "content": "string",
    "domainId": "number",
    "userId": "number",
    "createdAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

#### Delete Domain Comment

- **URL**: `/domains/:id/comments/:commentId`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **URL Parameters**: 
  - `id` - Domain ID
  - `commentId` - Comment ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Comment deleted successfully"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to delete this comment
  - `404 Not Found`: Comment not found

## Definition Endpoints

Definitions represent learning concepts within a domain.

### Get Domain Definitions

- **URL**: `/domains/:id/definitions`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "code": "string",
      "name": "string",
      "description": "string",
      "notes": "string",
      "domainId": "number",
      "ownerId": "number",
      "xPosition": "number",
      "yPosition": "number",
      "references": ["string"],
      "prerequisites": ["string"],
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

### Create Definition

- **URL**: `/domains/:id/definitions`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "code": "string (required)",
    "name": "string (required)",
    "description": "string (required)",
    "notes": "string (optional)",
    "references": ["string (optional)"],
    "prerequisiteIds": ["number (optional)"],
    "xPosition": "number (optional)",
    "yPosition": "number (optional)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "code": "string",
    "name": "string",
    "description": "string",
    "notes": "string",
    "domainId": "number",
    "ownerId": "number",
    "xPosition": "number",
    "yPosition": "number",
    "references": ["string"],
    "prerequisites": ["string"],
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `403 Forbidden`: Not authorized to create definitions in this domain
  - `404 Not Found`: Domain not found

### Get Definition by ID

- **URL**: `/definitions/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Definition ID
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "code": "string",
    "name": "string",
    "description": "string",
    "notes": "string",
    "domainId": "number",
    "ownerId": "number",
    "xPosition": "number",
    "yPosition": "number",
    "references": ["string"],
    "prerequisites": ["string"],
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this definition
  - `404 Not Found`: Definition not found

### Update Definition

- **URL**: `/definitions/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Definition ID
- **Request Body**:
  ```json
  {
    "code": "string (optional)",
    "name": "string (optional)",
    "description": "string (optional)",
    "notes": "string (optional)",
    "references": ["string (optional)"],
    "prerequisiteIds": ["number (optional)"],
    "xPosition": "number (optional)",
    "yPosition": "number (optional)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "code": "string",
    "name": "string",
    "description": "string",
    "notes": "string",
    "domainId": "number",
    "ownerId": "number",
    "xPosition": "number",
    "yPosition": "number",
    "references": ["string"],
    "prerequisites": ["string"],
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `403 Forbidden`: Not authorized to update this definition
  - `404 Not Found`: Definition not found

### Delete Definition

- **URL**: `/definitions/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Definition ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Definition deleted successfully"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to delete this definition
  - `404 Not Found`: Definition not found

### Get Definition by Code

- **URL**: `/definitions/code/:code`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `code` - Definition code
- **Query Parameters**: `domainId` - Optional domain ID to narrow search
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "code": "string",
      "name": "string",
      "description": "string",
      "notes": "string",
      "domainId": "number",
      "ownerId": "number",
      "xPosition": "number",
      "yPosition": "number",
      "references": ["string"],
      "prerequisites": ["string"],
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access any definitions with this code
  - `404 Not Found`: No definitions found with this code

## Exercise Endpoints

Exercises represent practice problems related to definitions.

### Get Domain Exercises

- **URL**: `/domains/:id/exercises`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "code": "string",
      "name": "string",
      "statement": "string",
      "description": "string",
      "hints": "string",
      "domainId": "number",
      "ownerId": "number",
      "verifiable": "boolean",
      "result": "string",
      "difficulty": "number (1-7)",
      "prerequisites": ["string"],
      "xPosition": "number",
      "yPosition": "number",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

### Create Exercise

- **URL**: `/domains/:id/exercises`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "code": "string (required)",
    "name": "string (required)",
    "statement": "string (required)",
    "description": "string (optional)",
    "hints": "string (optional)",
    "verifiable": "boolean (optional)",
    "result": "string (optional)",
    "difficulty": "number (optional, 1-7)",
    "prerequisiteIds": ["number (optional)"],
    "xPosition": "number (optional)",
    "yPosition": "number (optional)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "code": "string",
    "name": "string",
    "statement": "string",
    "description": "string",
    "hints": "string",
    "domainId": "number",
    "ownerId": "number",
    "verifiable": "boolean",
    "result": "string",
    "difficulty": "number (1-7)",
    "prerequisites": ["string"],
    "xPosition": "number",
    "yPosition": "number",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `403 Forbidden`: Not authorized to create exercises in this domain
  - `404 Not Found`: Domain not found

### Get Exercise by ID

- **URL**: `/exercises/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Exercise ID
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "code": "string",
    "name": "string",
    "statement": "string",
    "description": "string",
    "hints": "string",
    "domainId": "number",
    "ownerId": "number",
    "verifiable": "boolean",
    "result": "string",
    "difficulty": "number (1-7)",
    "prerequisites": ["string"],
    "xPosition": "number",
    "yPosition": "number",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this exercise
  - `404 Not Found`: Exercise not found

### Update Exercise

- **URL**: `/exercises/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Exercise ID
- **Request Body**:
  ```json
  {
    "code": "string (optional)",
    "name": "string (optional)",
    "statement": "string (optional)",
    "description": "string (optional)",
    "hints": "string (optional)",
    "verifiable": "boolean (optional)",
    "result": "string (optional)",
    "difficulty": "number (optional, 1-7)",
    "prerequisiteIds": ["number (optional)"],
    "xPosition": "number (optional)",
    "yPosition": "number (optional)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "code": "string",
    "name": "string",
    "statement": "string",
    "description": "string",
    "hints": "string",
    "domainId": "number",
    "ownerId": "number",
    "verifiable": "boolean",
    "result": "string",
    "difficulty": "number (1-7)",
    "prerequisites": ["string"],
    "xPosition": "number",
    "yPosition": "number",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid input data
  - `403 Forbidden`: Not authorized to update this exercise
  - `404 Not Found`: Exercise not found

### Delete Exercise

- **URL**: `/exercises/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Exercise ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Exercise deleted successfully"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to delete this exercise
  - `404 Not Found`: Exercise not found

### Get Exercise by Code

- **URL**: `/exercises/code/:code`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `code` - Exercise code
- **Query Parameters**: `domainId` - Optional domain ID to narrow search
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "code": "string",
      "name": "string",
      "statement": "string",
      "description": "string",
      "hints": "string",
      "domainId": "number",
      "ownerId": "number",
      "verifiable": "boolean",
      "result": "string",
      "difficulty": "number (1-7)",
      "prerequisites": ["string"],
      "xPosition": "number",
      "yPosition": "number",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access any exercises with this code
  - `404 Not Found`: No exercises found with this code

### Verify Exercise Answer

- **URL**: `/exercises/:id/verify`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Exercise ID
- **Request Body**:
  ```json
  {
    "answer": "string (required)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "correct": "boolean",
    "message": "string"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: This exercise is not automatically verifiable
  - `404 Not Found`: Exercise not found

## Advanced SRS (Spaced Repetition System) Endpoints

The SRS system provides sophisticated learning features including credit propagation, status management, and optimized review scheduling.

### Node Statuses

Nodes (definitions and exercises) can have the following statuses:
- **fresh**: Never studied
- **tackling**: Currently being learned
- **grasped**: Understood and ready for spaced repetition
- **learned**: Mastered (optional future status)

### Submit Review

- **URL**: `/srs/reviews`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Submit an explicit review for a node (definition or exercise)
- **Request Body**:
  ```json
  {
    "nodeId": "number (required)",
    "nodeType": "string (required, definition|exercise)",
    "success": "boolean (required)",
    "quality": "number (required, 0-5)",
    "timeTaken": "number (optional, seconds)",
    "sessionId": "number (optional)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": "boolean",
    "message": "string",
    "updatedNodes": [
      {
        "id": "number",
        "userId": "number",
        "nodeId": "number",
        "nodeType": "string",
        "status": "string",
        "easinessFactor": "number",
        "intervalDays": "number",
        "repetitions": "number",
        "lastReview": "timestamp",
        "nextReview": "timestamp",
        "accumulatedCredit": "number",
        "creditPostponed": "boolean",
        "totalReviews": "number",
        "successfulReviews": "number"
      }
    ],
    "creditFlow": [
      {
        "nodeId": "number",
        "nodeType": "string",
        "credit": "number",
        "type": "string (explicit|implicit)"
      }
    ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid node type or quality value
  - `500 Internal Server Error`: Review processing failed

### Get Due Reviews

- **URL**: `/srs/domains/:domainId/due`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Query Parameters**: `type` - Optional filter (definition|exercise|mixed, default: mixed)
- **Description**: Get nodes that are due for review, optimally ordered
- **Response**: `200 OK`
  ```json
  {
    "dueNodes": [
      {
        "nodeId": "number",
        "nodeType": "string",
        "nodeCode": "string",
        "nodeName": "string",
        "status": "string",
        "easinessFactor": "number",
        "intervalDays": "number",
        "repetitions": "number",
        "lastReview": "timestamp",
        "nextReview": "timestamp",
        "accumulatedCredit": "number",
        "creditPostponed": "boolean",
        "totalReviews": "number",
        "successfulReviews": "number",
        "daysUntilReview": "number",
        "isDue": "boolean"
      }
    ]
  }
  ```

### Get Review History

- **URL**: `/srs/reviews/history`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**: 
  - `nodeId` - Optional node ID filter
  - `nodeType` - Optional node type filter
  - `limit` - Optional limit (default: 100)
- **Description**: Get review history for the user
- **Response**: `200 OK`
  ```json
  {
    "history": [
      {
        "id": "number",
        "userId": "number",
        "nodeId": "number",
        "nodeType": "string",
        "reviewTime": "timestamp",
        "reviewType": "string",
        "success": "boolean",
        "quality": "number",
        "timeTaken": "number",
        "creditApplied": "number",
        "easinessFactorBefore": "number",
        "easinessFactorAfter": "number",
        "intervalBefore": "number",
        "intervalAfter": "number"
      }
    ]
  }
  ```

### Get Domain Progress

- **URL**: `/srs/domains/:domainId/progress`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Description**: Get progress for all nodes in a domain
- **Response**: `200 OK`
  ```json
  {
    "progress": [
      {
        "nodeId": "number",
        "nodeType": "string",
        "nodeCode": "string",
        "nodeName": "string",
        "status": "string",
        "easinessFactor": "number",
        "intervalDays": "number",
        "repetitions": "number",
        "lastReview": "timestamp",
        "nextReview": "timestamp",
        "accumulatedCredit": "number",
        "creditPostponed": "boolean",
        "totalReviews": "number",
        "successfulReviews": "number",
        "daysUntilReview": "number",
        "isDue": "boolean"
      }
    ]
  }
  ```

### Get Domain Statistics

- **URL**: `/srs/domains/:domainId/stats`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Description**: Get comprehensive statistics for a domain
- **Response**: `200 OK`
  ```json
  {
    "domainId": "number",
    "totalNodes": "number",
    "freshNodes": "number",
    "tacklingNodes": "number",
    "graspedNodes": "number",
    "learnedNodes": "number",
    "dueReviews": "number",
    "completedToday": "number",
    "successRate": "number"
  }
  ```

### Update Node Status

- **URL**: `/srs/nodes/status`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Description**: Update the status of a node (with automatic propagation)
- **Request Body**:
  ```json
  {
    "nodeId": "number (required)",
    "nodeType": "string (required, definition|exercise)",
    "status": "string (required, fresh|tackling|grasped|learned)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Node status updated successfully"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid status or node type

### SRS Study Sessions

#### Start SRS Session

- **URL**: `/srs/sessions`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Start a new SRS study session
- **Request Body**:
  ```json
  {
    "domainId": "number (required)",
    "sessionType": "string (required, definition|exercise|mixed)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "domainId": "number",
    "sessionType": "string",
    "startTime": "timestamp",
    "endTime": "timestamp (null)",
    "totalReviews": "number",
    "successfulReviews": "number",
    "duration": "number (null)"
  }
  ```

#### End SRS Session

- **URL**: `/srs/sessions/:sessionId/end`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `sessionId` - Session ID
- **Description**: End an active SRS study session
- **Response**: `200 OK`
  ```json
  {
    "message": "Session ended successfully"
  }
  ```

#### Get User SRS Sessions

- **URL**: `/srs/sessions`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**: `limit` - Optional limit (default: 20)
- **Description**: Get user's SRS study sessions
- **Response**: `200 OK`
  ```json
  {
    "sessions": [
      {
        "id": "number",
        "domainId": "number",
        "sessionType": "string",
        "startTime": "timestamp",
        "endTime": "timestamp",
        "totalReviews": "number",
        "successfulReviews": "number",
        "duration": "number"
      }
    ]
  }
  ```

### Prerequisites Management

#### Create Prerequisite

- **URL**: `/srs/prerequisites`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a manual prerequisite relationship
- **Request Body**:
  ```json
  {
    "nodeId": "number (required)",
    "nodeType": "string (required, definition|exercise)",
    "prerequisiteId": "number (required)",
    "prerequisiteType": "string (required, definition|exercise)",
    "weight": "number (required, 0-1)",
    "isManual": "boolean (required)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "nodeId": "number",
    "nodeType": "string",
    "prerequisiteId": "number",
    "prerequisiteType": "string",
    "weight": "number",
    "isManual": "boolean",
    "createdAt": "timestamp"
  }
  ```

#### Get Prerequisites

- **URL**: `/srs/domains/:domainId/prerequisites`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Description**: Get all prerequisites for a domain
- **Response**: `200 OK`
  ```json
  {
    "prerequisites": [
      {
        "id": "number",
        "nodeId": "number",
        "nodeType": "string",
        "prerequisiteId": "number",
        "prerequisiteType": "string",
        "weight": "number",
        "isManual": "boolean",
        "createdAt": "timestamp"
      }
    ]
  }
  ```

#### Delete Prerequisite

- **URL**: `/srs/prerequisites/:prerequisiteId`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **URL Parameters**: `prerequisiteId` - Prerequisite ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Prerequisite deleted successfully"
  }
  ```

### Test/Debug Endpoints

#### Test Credit Propagation

- **URL**: `/srs/test/credit-propagation`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Test credit propagation for a specific node (debugging)
- **Request Body**:
  ```json
  {
    "domainId": "number (required)",
    "nodeId": "number (required)",
    "nodeType": "string (required)",
    "success": "boolean (required)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "credits": [
      {
        "nodeId": "number",
        "nodeType": "string",
        "credit": "number",
        "type": "string"
      }
    ]
  }
  ```

## Legacy Progress Tracking Endpoints

The legacy system provides simpler progress tracking with basic spaced repetition.

### Get Domain Progress (Legacy)

- **URL**: `/progress/domains`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: `200 OK`
  ```json
  [
    {
      "userId": "number",
      "domainId": "number",
      "enrollmentDate": "timestamp",
      "progress": "number (0-100)",
      "lastActivity": "timestamp"
    }
  ]
  ```

### Get Definition Progress (Legacy)

- **URL**: `/progress/domains/:domainId/definitions`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Response**: `200 OK`
  ```json
  [
    {
      "userId": "number",
      "definitionId": "number",
      "learned": "boolean",
      "lastReview": "timestamp",
      "nextReview": "timestamp",
      "easinessFactor": "number",
      "intervalDays": "number",
      "repetitions": "number",
      "definition": {
        /* Definition object */
      }
    }
  ]
  ```

### Get Exercise Progress (Legacy)

- **URL**: `/progress/domains/:domainId/exercises`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Response**: `200 OK`
  ```json
  [
    {
      "userId": "number",
      "exerciseId": "number",
      "completed": "boolean",
      "correct": "boolean",
      "attempts": "number",
      "lastAttempt": "timestamp",
      "exercise": {
        /* Exercise object */
      }
    }
  ]
  ```

### Submit Definition Review (Legacy)

- **URL**: `/progress/definitions/:id/review`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Definition ID
- **Request Body**:
  ```json
  {
    "result": "string (required, again|hard|good|easy)",
    "timeTaken": "number (required, seconds)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Review recorded successfully"
  }
  ```

### Submit Exercise Attempt (Legacy)

- **URL**: `/progress/exercises/:id/attempt`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Exercise ID
- **Request Body**:
  ```json
  {
    "answer": "string (required)",
    "timeTaken": "number (required, seconds)"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "correct": "boolean",
    "message": "string"
  }
  ```

### Get Definitions for Review (Legacy)

- **URL**: `/progress/domains/:domainId/review`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `domainId` - Domain ID
- **Query Parameters**: `limit` - Maximum number of definitions to return
- **Response**: `200 OK`
  ```json
  [
    {
      /* Definition object */
    }
  ]
  ```

## Legacy Study Session Endpoints

### Start Session (Legacy)

- **URL**: `/sessions/start`
- **Method**: `POST`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "domainId": "number (required)"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "userId": "number",
    "domainId": "number",
    "startTime": "timestamp",
    "endTime": "timestamp (null)"
  }
  ```

### End Session (Legacy)

- **URL**: `/sessions/:id/end`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Session ID
- **Response**: `200 OK`
  ```json
  {
    "message": "Session ended successfully"
  }
  ```

### Get Sessions (Legacy)

- **URL**: `/sessions`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "userId": "number",
      "domainId": "number",
      "startTime": "timestamp",
      "endTime": "timestamp"
    }
  ]
  ```

### Get Session Details (Legacy)

- **URL**: `/sessions/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Session ID
- **Response**: `200 OK`
  ```json
  {
    "session": {
      "id": "number",
      "startTime": "timestamp",
      "endTime": "timestamp",
      "duration": "number (seconds)",
      "domainId": "number",
      "domainName": "string",
      "definitionsReviewCount": "number",
      "exercisesCompletedCount": "number",
      "correctExercisesCount": "number"
    },
    "definitions": [
      {
        "id": "number",
        "code": "string",
        "name": "string",
        "reviewResult": "string",
        "timeTaken": "number"
      }
    ],
    "exercises": [
      {
        "id": "number",
        "code": "string",
        "name": "string",
        "completed": "boolean",
        "correct": "boolean",
        "timeTaken": "number"
      }
    ]
  }
  ```

## Knowledge Graph Endpoints

### Get Visual Graph

- **URL**: `/domains/:id/graph`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  {
    "nodes": [
      {
        "id": "string",
        "type": "string (definition|exercise)",
        "name": "string",
        "code": "string",
        "x": "number",
        "y": "number",
        "prerequisites": ["string"]
      }
    ],
    "links": [
      {
        "source": "string",
        "target": "string"
      }
    ]
  }
  ```

### Update Graph Positions

- **URL**: `/domains/:id/graph/positions`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "nodeId1": {"x": "number", "y": "number"},
    "nodeId2": {"x": "number", "y": "number"}
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Positions updated successfully"
  }
  ```

### Export Domain

- **URL**: `/domains/:id/export`
- **Method**: `GET`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Response**: `200 OK`
  ```json
  {
    "definitions": {
      "definitionId1": {
        "code": "string",
        "name": "string",
        "description": "string",
        "notes": "string",
        "references": ["string"],
        "prerequisites": ["string"],
        "xPosition": "number",
        "yPosition": "number"
      }
    },
    "exercises": {
      "exerciseId1": {
        "code": "string",
        "name": "string",
        "statement": "string",
        "description": "string",
        "hints": "string",
        "verifiable": "boolean",
        "result": "string",
        "difficulty": "number",
        "prerequisites": ["string"],
        "xPosition": "number",
        "yPosition": "number"
      }
    }
  }
  ```

### Import Domain

- **URL**: `/domains/:id/import`
- **Method**: `POST`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "definitions": {
      /* Same format as export */
    },
    "exercises": {
      /* Same format as export */
    }
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Domain imported successfully"
  }
  ```

## Error Responses

All API endpoints follow a consistent error response format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request - Invalid request data
- `401`: Unauthorized - Missing or invalid authentication
- `403`: Forbidden - Authenticated but not authorized for the requested resource
- `404`: Not Found - Requested resource does not exist
- `409`: Conflict - Resource already exists (e.g., email or username)
- `500`: Internal Server Error - Server-side error

## API Usage Best Practices

1. **Authentication**: Store the JWT token securely and include it in all authenticated requests.
2. **Error Handling**: Always handle error responses appropriately in the UI.
3. **Learning Systems**: Choose between legacy progress system and advanced SRS based on your needs:
   - Use SRS endpoints (`/api/srs/*`) for advanced learning features
   - Use legacy endpoints (`/api/progress/*`, `/api/sessions/*`) for simple progress tracking
4. **Prerequisites**: Use the new node_prerequisites system for better prerequisite management
5. **Credit Propagation**: When a user reviews a node, the SRS system automatically propagates credits to related nodes
6. **Status Management**: Nodes progress through statuses: fresh → tackling → grasped → learned
7. **Optimistic Updates**: Consider implementing optimistic updates for a better user experience
8. **Caching**: Cache frequently accessed data like domain lists and user information
9. **Data Validation**: Validate form inputs client-side before sending to the API

## SRS System Concepts

### Credit Propagation
When a user successfully reviews a node, positive credits flow to prerequisite nodes. Failed reviews send negative credits to dependent nodes. Credits accumulate and can:
- Postpone reviews when reaching +100% credit
- Anticipate reviews when reaching -100% credit

### Node Statuses
- **Fresh**: Never studied, default state
- **Tackling**: Currently learning, user is working on understanding
- **Grasped**: Understood and entered into spaced repetition cycle
- **Learned**: Mastered (optional status for completed learning)

### Quality Ratings (0-5)
- 0: Complete failure
- 1: Incorrect with serious difficulty
- 2: Incorrect but familiar
- 3: Correct with serious difficulty
- 4: Correct after hesitation
- 5: Perfect recall

### Review Types
- **Explicit**: Direct user review with quality rating
- **Implicit**: Automatic reviews through credit propagation
