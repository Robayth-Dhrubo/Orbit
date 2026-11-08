
<div align="center">

# ORBIT

### Tutor Appointment Booking Service

**Find a tutor. Choose a time. Book with confidence.**

A web-based tutoring appointment platform for students, independent tutors, and small tutoring organizations.

**SOEN 387 — Web-Based Enterprise Application Design**  
Concordia University · Fall 2026

`Node.js` `Express` `TypeScript` `PostgreSQL` `React` `OpenAPI`

</div>

---

> **Project Status:** Under Development  
> ORBIT is being developed as part of SOEN 387. This documentation describes the intended system, architecture, and development requirements. Features will be marked complete as they are implemented and tested.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Problem Statement](#problem-statement)
3. [Project Objectives](#project-objectives)
4. [Features](#features)
5. [Target Users](#target-users)
6. [System Architecture](#system-architecture)
7. [Technology Stack](#technology-stack)
8. [API Design](#api-design)
9. [Database Architecture](#database-architecture)
10. [Concurrency Management](#concurrency-management)
11. [Authentication and Authorization](#authentication-and-authorization)
12. [Idempotency](#idempotency)
13. [Email Notification System](#email-notification-system)
14. [Frontend Application](#frontend-application)
15. [Repository Structure](#repository-structure)
16. [Installation and Setup](#installation-and-setup)
17. [Testing Strategy](#testing-strategy)
18. [Development Phases](#development-phases)
19. [Team Responsibilities](#team-responsibilities)
20. [Project Management](#project-management)

---

# Project Overview

ORBIT is a tutoring appointment booking service designed to simplify how students schedule tutoring sessions.

The platform provides a centralized system where students can discover tutors, check availability, reserve appointments, and manage existing bookings.

Tutors can publish available time slots, while ORBIT ensures that appointments are managed consistently and securely.

The system is designed around a REST API so that multiple client applications can interact with the same backend without duplicating business logic.

### Main Capabilities

- Tutor discovery and availability management
- Student appointment booking
- Appointment retrieval and cancellation
- JWT-based authentication
- Role-based authorization
- PostgreSQL persistence
- Concurrency-safe reservations
- Idempotent booking operations
- Asynchronous email notifications
- OpenAPI-based service documentation

The primary engineering challenge is preventing multiple students from reserving the same tutor appointment slot simultaneously.

---

# Problem Statement

Tutoring sessions are frequently arranged through email, messaging applications, spreadsheets, or general scheduling tools.

These methods can create several problems:

- Students cannot always identify available tutors.
- Appointment availability can become outdated.
- Multiple students may request the same time slot.
- Tutors spend additional time coordinating schedules.
- Appointment changes may not be communicated consistently.

ORBIT aims to provide a single, reliable service for managing tutor availability and confirmed appointments.

The backend maintains the authoritative booking state rather than relying on client-side availability information.

---

# Project Objectives

| Objective | Implementation Approach |
|-----------|-------------------------|
| Simplify booking | REST API for tutors, availability, and appointments |
| Prevent double-booking | PostgreSQL transactions and row locking |
| Secure user access | JWT authentication and authorization |
| Maintain reliable records | PostgreSQL persistence |
| Prevent duplicate operations | Idempotency keys |
| Support multiple clients | OpenAPI-defined API contract |
| Send notifications reliably | Transactional outbox and background worker |
| Enable repeatable setup | Docker and Docker Compose |
| Verify system correctness | Automated API and concurrency tests |

---

# Features

## Student Features

- [ ] Create an account
- [ ] Sign in securely
- [ ] Browse available tutors
- [ ] View appointment availability
- [ ] Reserve an available time slot
- [ ] View personal appointments
- [ ] Cancel an appointment
- [ ] Receive booking confirmation emails
- [ ] Receive appointment reminders

## Tutor Features

- [ ] Sign in to a tutor account
- [ ] Create available appointment slots
- [ ] View published availability
- [ ] Prevent overlapping availability
- [ ] Manage availability within authorization rules

## Backend Features

- [ ] REST API following OpenAPI 3.x
- [ ] JWT authentication
- [ ] Role-based authorization
- [ ] Input validation
- [ ] Structured error responses
- [ ] PostgreSQL database integration
- [ ] Database transactions
- [ ] Concurrency protection
- [ ] Idempotent booking operations
- [ ] Transactional outbox
- [ ] Background email notification worker
- [ ] Database migrations
- [ ] Liveness and readiness endpoints
- [ ] Structured application logging

## Potential Future Enhancements

The following features are being considered following feedback on the original proposal.

### Course-Based SmartMatch

Students enter their course and preferred appointment time.

The system searches suitable tutors and returns matching availability.

### Cancellation Waitlist

When no suitable appointment is available, students can request notifications when a matching slot becomes available.

These features are **proposed enhancements**, not completed functionality or Phase 2 requirements.

---

# Target Users

## Students

Students who need tutoring support and want a reliable way to reserve appointments.

## Independent Tutors

Tutors who want to publish availability and organize appointments without manually coordinating every booking.

## Small Tutoring Organizations

Organizations managing multiple tutors and student appointments.

### Business Model

The initial proposed pricing is approximately **CAD $10–15 per tutor per month**.

This is a preliminary business hypothesis rather than validated market demand.

The project will assess its proposed value through customer feedback and comparison with alternatives such as:

- Calendly
- Acuity Scheduling
- TutorBird
- Manual scheduling through messages or calendars

---

# System Architecture

ORBIT uses a layered architecture to separate HTTP communication, business logic, and data persistence.

## High-Level Architecture

```mermaid
flowchart TD
    A["React Web Application"]
    B["Express REST API"]
    C["Authentication Middleware"]
    D["Domain and Service Layer"]
    E["Repository and Data Layer"]
    F[("PostgreSQL Database")]
    G["Transactional Outbox"]
    H["Background Email Worker"]
    I["Resend Email API"]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    D -.-> G
    G -.-> H
    H -.-> I
```

The notification worker and Resend integration are planned for the final development phase.

## Application Layers

### 1. Interface Layer

Responsible for HTTP communication.

Includes:

- Express routes
- Request validation
- Authentication middleware
- Controllers
- HTTP responses
- Error handling

### 2. Domain / Service Layer

Responsible for business rules.

Includes:

- Tutor availability management
- Appointment booking rules
- Appointment cancellation
- Authorization checks
- Booking transaction coordination
- Idempotency decisions

### 3. Repository / Data Layer

Responsible for database access.

Includes:

- PostgreSQL queries
- Database transactions
- Row locking
- Entity persistence
- Data retrieval
- Database constraints

### 4. Integration Layer

Responsible for external services.

Includes:

- Email provider integration
- Transactional outbox processing
- Background jobs
- Retry handling
- Failure recovery

---

# Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js |
| API Framework | Express |
| Programming Language | TypeScript |
| Database | PostgreSQL |
| Frontend | React + Vite |
| API Specification | OpenAPI 3.x |
| Schema Documentation | JSON Schema |
| API Explorer | Swagger UI |
| Authentication | JWT |
| Containerization | Docker |
| Environment Orchestration | Docker Compose |
| Email Integration | Resend |
| Testing | API, integration, security, and concurrency tests |
| Version Control | Git and GitHub |

---

# API Design

ORBIT exposes a REST API using JSON requests and responses.

The published OpenAPI specification defines endpoint behavior, request validation, authentication requirements, and response formats.

## Main API Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| GET | `/tutors` | Retrieve available tutors | Public |
| GET | `/tutors/{tutorId}/slots` | Retrieve available slots | Public |
| POST | `/tutors/{tutorId}/slots` | Create tutor availability | Tutor |
| POST | `/appointments` | Book an appointment | Student |
| GET | `/appointments` | Retrieve own appointments | Required |
| DELETE | `/appointments/{appointmentId}` | Cancel an appointment | Owner |

## Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register a user |
| POST | `/auth/login` | Authenticate and issue a JWT |

## Example: Create Appointment

### Request

```http
POST /appointments HTTP/1.1
Authorization: Bearer <access_token>
Idempotency-Key: booking-request-001
Content-Type: application/json

{
  "slotId": "slot_123",
  "topic": "Calculus",
  "notes": "Optional notes"
}
```

### Successful Response

**HTTP 201 Created**

```json
{
  "appointmentId": "appointment_456",
  "slotId": "slot_123",
  "status": "confirmed"
}
```

### Booking Conflict

**HTTP 409 Conflict**

```json
{
  "error": {
    "code": "SLOT_ALREADY_BOOKED",
    "message": "This appointment slot is no longer available.",
    "correlationId": "req_001"
  }
}
```

### Important Response Codes

| HTTP Code | Meaning |
|-----------|---------|
| 200 | Successful retrieval or operation |
| 201 | Appointment created |
| 400 | Invalid request |
| 401 | Authentication required or invalid |
| 403 | Access forbidden |
| 404 | Resource not found |
| 409 | Booking conflict |
| 422 | Validation error |
| 500 | Internal server error |

These are planned contract examples. The implemented service must match the committed OpenAPI specification.

---

# Database Architecture

PostgreSQL is the primary database for ORBIT.

It stores users, tutors, availability slots, appointments, idempotency records, and notification events.

## Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o| TUTOR_PROFILES : has
    USERS ||--o{ APPOINTMENTS : books
    TUTOR_PROFILES ||--o{ AVAILABILITY_SLOTS : publishes
    AVAILABILITY_SLOTS ||--o{ APPOINTMENTS : receives
    USERS ||--o{ IDEMPOTENCY_RECORDS : owns
    APPOINTMENTS ||--o{ OUTBOX_EVENTS : generates
```

The outbox entity is part of the planned final-phase integration.

## Main Database Tables

### users

Stores account information.

```text
id
email
password_hash
role
created_at
updated_at
```

### tutor_profiles

Stores tutor-specific information.

```text
id
user_id
display_name
bio
created_at
```

### availability_slots

Stores appointment availability.

```text
id
tutor_id
starts_at
ends_at
created_at
```

### appointments

Stores confirmed and cancelled bookings.

```text
id
student_id
slot_id
topic
notes
status
created_at
updated_at
```

### idempotency_records

Stores information about repeated requests.

```text
id
user_id
operation
idempotency_key
request_hash
response_status
response_body
created_at
```

### outbox_events

Planned for asynchronous notifications.

```text
id
event_type
aggregate_id
payload
status
attempt_count
next_attempt_at
created_at
```

These table definitions represent the intended logical structure. Exact names and column types will be defined in the database migrations.

## Database Constraints

ORBIT must prevent two confirmed appointments from referencing the same slot.

A planned partial unique index is:

```sql
CREATE UNIQUE INDEX one_confirmed_appointment_per_slot
ON appointments (slot_id)
WHERE status = 'confirmed';
```

The backend must also prevent overlapping availability slots for the same tutor.

---

# Concurrency Management

## Problem

Two students may attempt to book the same appointment simultaneously.

Without proper concurrency protection, both requests could read the slot as available and create conflicting reservations.

## Solution

ORBIT uses PostgreSQL transactions and pessimistic locking.

The booking operation must:

1. Start a database transaction.
2. Lock the selected appointment slot.
3. Recheck availability.
4. Create the appointment if available.
5. Store the related idempotency result.
6. Commit the transaction.
7. Reject competing requests with HTTP `409`.

## Concurrent Booking Sequence

```mermaid
sequenceDiagram
    participant A as Student A
    participant B as Student B
    participant API as ORBIT API
    participant DB as PostgreSQL

    A->>API: POST /appointments
    B->>API: POST /appointments

    API->>DB: Request A locks appointment slot
    DB-->>API: Lock granted

    API->>DB: Create appointment and commit
    API-->>A: 201 Created

    API->>DB: Request B obtains lock
    DB-->>API: Slot already reserved
    API-->>B: 409 Conflict
```

## Database Locking

The service will use a locking query equivalent to:

```sql
SELECT id
FROM availability_slots
WHERE id = $1
FOR UPDATE;
```

All booking decisions must be made while the appropriate transaction is active.

The database unique constraint serves as additional protection against double-booking.

## Expected Concurrency Test

The proposed concurrency test sends **20 simultaneous requests** for the same free slot.

Expected result:

```text
ORBIT Concurrency Test
--------------------------------
Total requests:        20
Successful bookings:    1
Conflict responses:    19
Confirmed DB records:   1

Expected result: PASS
```

This represents the acceptance target. Actual results will be recorded after the test is implemented and executed.

---

# Authentication and Authorization

ORBIT uses JWT-based authentication.

After successfully logging in, the user receives a signed access token.

Protected API endpoints require the token in the HTTP Authorization header.

## Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as ORBIT API
    participant DB as PostgreSQL

    U->>API: Submit login credentials
    API->>DB: Retrieve user and password hash
    DB-->>API: User record
    API->>API: Verify password
    API-->>U: Return signed JWT

    U->>API: Request protected endpoint with JWT
    API->>API: Validate token
    API-->>U: Return authorized response
```

## Security Requirements

- Passwords must be stored using secure hashes.
- JWT signatures and expiration must be validated.
- Protected endpoints require authenticated users.
- User identity must be derived from the verified token.
- Students may access only their own appointments.
- Tutors may manage only their own availability.
- Request parameters and bodies must be validated.
- Internal errors must not expose sensitive information.

## Authorization Test

A required security scenario is:

1. Student A books an appointment.
2. Student B logs in.
3. Student B attempts to access or cancel Student A's appointment.
4. The request must be rejected.
5. Student A's appointment must remain unchanged.

---

# Idempotency

Booking requests can be repeated because of network failures, timeouts, or user retries.

Without idempotency, these repeated requests could accidentally create duplicate records.

ORBIT requires an `Idempotency-Key` for appointment creation.

## Expected Behavior

| Request | Expected Result |
|---------|-----------------|
| New key and valid request | Create appointment |
| Same key and identical request | Return original response |
| Same key and different request | Return `409 Conflict` |
| Concurrent requests using same key | Only one operation applies |

The service stores the authenticated user, operation, key, request fingerprint, and original successful response.

Booking and idempotency state must be committed together in one database transaction.

---

# Email Notification System

The full project includes asynchronous appointment notifications using Resend.

Notifications must not delay appointment booking.

## Notification Architecture

```mermaid
flowchart TD
    A["Appointment Confirmed"]
    B["Save Outbox Event"]
    C["Background Worker"]
    D["Resend Email API"]
    E{"Delivery Successful?"}
    F["Mark Delivered"]
    G["Retry with Backoff"]
    H["Mark Failed for Review"]

    A --> B
    B --> C
    C --> D
    D --> E
    E -->|Yes| F
    E -->|Temporary Failure| G
    G --> C
    E -->|Retries Exhausted| H
```

## Planned Requirements

- Store notification events in PostgreSQL.
- Process email events in a background worker.
- Use a five-second request timeout.
- Retry temporary failures up to five attempts.
- Apply exponential backoff and jitter.
- Reuse a stable idempotency key.
- Record delivery and failure status.
- Allow failed notifications to be reviewed.
- Never cancel a confirmed booking because an email fails.

A separate HTTP mock will be used to test provider failures.

**Implementation phase:** Phase 3.

---

# Frontend Application

ORBIT's frontend will be developed using React and Vite.

The frontend acts as a client for the REST API. All critical booking decisions remain in the backend.

## Planned Pages

### 1. Authentication

- Login form
- Registration form
- Validation messages

### 2. Tutor Directory

- List of tutors
- Tutor information
- Available appointment times

### 3. Appointment Booking

- Selected tutor
- Selected date and time
- Booking confirmation
- Booking conflict feedback

### 4. My Appointments

- Upcoming appointments
- Appointment status
- Cancellation action

### 5. Tutor Availability

- View published time slots
- Create new availability
- Prevent conflicting schedules

## UI Design Direction

The frontend should follow a clean, responsive, campus-oriented visual style.

Suggested design principles:

- Simple navigation
- Clear appointment cards
- Accessible forms
- Responsive desktop and mobile layouts
- Consistent spacing and typography
- Obvious success/error feedback
- Minimal steps to complete a booking

Full frontend implementation is planned for Phase 3.

---

# Repository Structure

The proposed project structure separates the frontend, backend, API contract, database, and documentation.

```text
Orbit/
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── database/
│   │   │   ├── integrations/
│   │   │   └── app.ts
│   │   └── tests/
│   │
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── services/
│       │   └── App.tsx
│       └── package.json
│
├── contracts/
│   └── openapi.yaml
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── scripts/
│   └── concurrency/
│
├── docs/
│
├── compose.yaml
├── .env.example
├── .gitignore
└── README.md
```

This structure is a development target and should be updated to match the actual repository.

---

# Installation and Setup

## Prerequisites

The proposed development environment requires:

- Git
- Node.js
- npm
- PostgreSQL
- Docker and Docker Compose

## Clone the Repository

```bash
git clone https://github.com/Robayth-Dhrubo/Orbit.git

cd Orbit
```

## Environment Configuration

Once the `.env.example` file is committed:

```bash
cp .env.example .env
```

Example environment variables:

```dotenv
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/orbit

JWT_SECRET=replace_with_secure_local_secret
JWT_EXPIRES_IN=1h

RESEND_API_KEY=replace_when_email_integration_is_enabled
```

These are examples only. Actual variable names must match the implementation.

Never commit real credentials or `.env` files.

## Planned Docker Startup

```bash
docker compose up --build
```

The application should eventually start the backend and PostgreSQL through a reproducible configuration.

The notification worker will be included during Phase 3.

> **Note:** These setup steps describe the intended environment. They must be verified and updated once the corresponding project files and scripts have been committed.

---

# Testing Strategy

ORBIT will use automated testing to verify the correctness of the API and its business rules.

## Functional Tests

- Valid login
- Invalid login
- Tutor retrieval
- Tutor availability retrieval
- Tutor availability creation
- Successful appointment booking
- Invalid booking requests
- Appointment retrieval
- Appointment cancellation

## Security Tests

- Missing JWT
- Expired JWT
- Forged JWT
- Unauthorized appointment access
- Unauthorized cancellation
- Tutor availability ownership

## Concurrency Tests

- Two students booking the same slot
- Twenty students booking the same slot
- Concurrent identical idempotency requests
- Booking conflict handling
- Cancellation followed by rebooking
- Transaction rollback after failure

## Persistence Tests

- Database relationships
- Appointment persistence
- Restart behavior
- Migration application

## Notification Tests

Planned for Phase 3:

- Successful email delivery
- Simulated provider timeout
- Temporary provider failure
- Retry handling
- Duplicate notification prevention
- Permanent failure handling
- Worker restart recovery

---

# Development Phases

## Phase 1 — Proposal & Design

**Target:** September 24, 2026

- [x] Define the product concept
- [x] Identify the target users
- [x] Prepare the initial market analysis
- [x] Define the proposed REST API
- [x] Design the concurrency strategy
- [x] Choose the technology stack
- [x] Prepare the proposal and pitch

## Phase 2 — Core Service Milestone

**Deadline:** November 12, 2026

**Goal:** Demonstrate a running service with a published API contract, working domain/data layers, authentication, and concurrency protection.

### Requirements

- [ ] Running Express backend
- [ ] Published OpenAPI contract
- [ ] Working API controllers
- [ ] Working domain/service layer
- [ ] PostgreSQL connection
- [ ] Working repository/data layer
- [ ] JWT authentication
- [ ] Basic authorization
- [ ] Tutor availability endpoints
- [ ] Appointment booking endpoint
- [ ] Appointment retrieval and cancellation
- [ ] PostgreSQL transaction protection
- [ ] Double-booking prevention
- [ ] Concurrency test
- [ ] Short progress demonstration

### Phase 2 Deliverable

A working backend that authenticates users, allows appointment booking, persists booking data, and prevents concurrent double-booking.

## Phase 3 — Complete Service Development

**Target:** December 2026

### Frontend

- [ ] Complete React web application
- [ ] Implement full booking user experience
- [ ] Add loading, validation and error feedback
- [ ] Test frontend/backend integration

### Foreign-Service Integration

- [ ] Implement Resend integration
- [ ] Implement transactional outbox
- [ ] Implement background worker
- [ ] Implement timeout and retry handling
- [ ] Test provider failure and recovery

### Reliability & Deployment

- [ ] Complete ordered database migrations
- [ ] Configure Docker Compose
- [ ] Implement liveness/readiness endpoints
- [ ] Add structured logging
- [ ] Test persistence after restarts
- [ ] Validate OpenAPI conformance
- [ ] Demonstrate backward-compatible contract evolution

### Documentation

- [ ] Complete final project report
- [ ] Update architecture diagrams
- [ ] Maintain AI-collaboration log
- [ ] Prepare final demonstration
- [ ] Prepare individual oral defense

---

# Team Responsibilities

ORBIT is developed by four team members.

| Member | Primary Responsibility |
|--------|------------------------|
| **Robayth** | Authentication, authorization, OpenAPI, documentation and integration |
| **Mehjabin** | REST API, domain/service layer and React frontend |
| **Azmain** | PostgreSQL, repository layer, migrations and infrastructure |
| **Yousef** | Concurrency, transactions, idempotency and automated testing |

## Phase 2 Task Ownership

### Robayth

Authentication, authorization, published API contract, README, and milestone integration.

### Mehjabin

Tutor and appointment endpoints, business logic, and service-layer integration.

### Azmain

PostgreSQL schema, database repositories, persistence, and transaction support.

### Yousef

Concurrency-safe booking, idempotency, conflict handling, and automated concurrency tests.

All team members are expected to review code, contribute through individual GitHub accounts, and understand the complete architecture.

---

# Project Management

Development work is tracked using GitHub Issues and GitHub Projects.

## Issue Organization

```text
Phase 2 — Core Service Milestone
│
├── 1.1 Robayth
│   Authentication, Authorization & Documentation
│
├── 1.2 Mehjabin
│   Core Booking API & Domain Layer
│
├── 1.3 Azmain
│   PostgreSQL & Repository Layer
│
└── 1.4 Yousef
    Concurrency & Idempotency
```

## Development Workflow

1. Create a GitHub issue for each assigned development task.
2. Work on a dedicated feature branch.
3. Commit changes using descriptive messages.
4. Open a pull request.
5. Review and test the changes.
6. Merge approved changes into the main branch.
7. Update the issue status.

## Suggested Project Statuses

- **Backlog** — Task identified but not scheduled
- **Todo** — Ready to begin
- **In Progress** — Currently being implemented
- **In Review** — Awaiting code review or testing
- **Done** — Implemented, tested, and merged

## Phase 2 Completion Criteria

Phase 2 is considered complete when:

- The API is running.
- The contract is published.
- Interface, service and repository layers work.
- Authentication is functional.
- Bookings are persisted.
- Concurrent requests cannot double-book a slot.
- The milestone demonstration can be completed.

---

# Academic Context

This project is developed for **SOEN 387 — Web-Based Enterprise Application Design** at Concordia University.

AI tools may assist with documentation, implementation suggestions, testing, and code reviews. The team is responsible for verifying generated work and maintaining appropriate AI-collaboration records.

---

<div align="center">

### ORBIT

**Find the right tutor. Book with confidence.**

Developed for SOEN 387 · Concordia University · Fall 2026

</div>
