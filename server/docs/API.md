# API Documentation for Front-End Team

## Overview

This document provides comprehensive information about the backend API endpoints available for the front-end team to interact with. The API follows RESTful principles and uses JWT-based authentication.

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

## Progress Tracking Endpoints

### Get Domain Progress

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

### Get Definition Progress

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
- **Error Responses**:
  - `404 Not Found`: Domain not found

### Get Exercise Progress

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
- **Error Responses**:
  - `404 Not Found`: Domain not found

### Submit Definition Review

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
- **Error Responses**:
  - `400 Bad Request`: Invalid review result
  - `404 Not Found`: Definition not found

### Submit Exercise Attempt

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
- **Error Responses**:
  - `404 Not Found`: Exercise not found

### Get Definitions for Review

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
- **Error Responses**:
  - `404 Not Found`: Domain not found

## Study Session Endpoints

### Start Session

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
- **Error Responses**:
  - `404 Not Found`: Domain not found

### End Session

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
- **Error Responses**:
  - `403 Forbidden`: Not authorized to end this session
  - `404 Not Found`: Session not found

### Get Sessions

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

### Get Session Details

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
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this session
  - `404 Not Found`: Session not found

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
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

### Update Graph Positions

- **URL**: `/domains/:id/graph/positions`
- **Method**: `PUT`
- **Auth Required**: Yes
- **URL Parameters**: `id` - Domain ID
- **Request Body**:
  ```json
  {
    "nodeId1": {"x": "number", "y": "number"},
    "nodeId2": {"x": "number", "y": "number"},
    /* ... */
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Positions updated successfully"
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to update this domain
  - `404 Not Found`: Domain not found

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
      },
      /* ... */
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
      },
      /* ... */
    }
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Not authorized to access this domain
  - `404 Not Found`: Domain not found

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
- **Error Responses**:
  - `400 Bad Request`: Invalid import data
  - `403 Forbidden`: Not authorized to update this domain
  - `404 Not Found`: Domain not found

## Error Responses

All API endpoints follow a consistent error response format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Authenticated but not authorized for the requested resource
- `404 Not Found`: Requested resource does not exist
- `409 Conflict`: Resource already exists (e.g., email or username)
- `500 Internal Server Error`: Server-side error

## API Usage Best Practices

1. **Authentication**: Store the JWT token securely and include it in all authenticated requests.
2. **Error Handling**: Always handle error responses appropriately in the UI.
3. **Optimistic Updates**: Consider implementing optimistic updates for a better user experience.
4. **Caching**: Cache frequently accessed data like domain lists and user information.
5. **Pagination**: For endpoints that might return large lists, use the provided pagination parameters.
6. **Data Validation**: Validate form inputs client-side before sending to the API.

## WebSocket Support

The API does not currently include WebSocket endpoints, but future versions may include real-time features for collaborative learning experiences.
