# ORBIT — Technical Documentation

Documentation for the SOEN 387 Fall 2026 ORBIT tutoring appointment service. The canonical API description is [`openapi.yaml`](../openapi.yaml) at the repository root.

## Setup

| Document | Contents | Main responsibility |
|---|---|---|
| [Docker Compose setup](setup/docker.md) | API and PostgreSQL startup, readiness and restart checks | Azmain |
| [Database setup](setup/database.md) | PostgreSQL setup, migrations and seed process | Azmain |

## Phase 2 milestone

| Document | Contents | Main responsibility |
|---|---|---|
| [Requirements](phase2/requirements.md) | Milestone scope and implementation traceability | Team |
| [Demonstration](phase2/demo.md) | Repeatable login, booking, authorization and concurrency demo | Robayth / team |
| [Verification](phase2/verification.md) | Historical test results and integration record | Robayth |

## AI collaboration logs

| Document | Contents |
|---|---|
| [Robayth](ai-collaboration/robayth.md) | Robayth's recorded AI assistance and engineering review |
| [Azmain](ai-collaboration/azmain.md) | Azmain's AI collaboration record |

The backend is in [`apps/api/`](../apps/api/) and the test client is in [`apps/web/`](../apps/web/). Foreign-service integration and final deployment work belong to the final-project phase, not the Phase 2 milestone described here.
