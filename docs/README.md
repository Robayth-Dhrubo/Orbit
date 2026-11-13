# ORBIT — Technical Documentation

Documentation for the SOEN 387 Fall 2026 ORBIT tutoring appointment service.

| Document | Contents | Main responsibility |
|---|---|---|
| [Phase 2 requirements](phase2-requirements.md) | Milestone scope and implementation traceability | Team |
| [Phase 2 demonstration](phase2-demo.md) | Repeatable login, booking, authorization and concurrency demo | Robayth / team |
| [Phase 2 verification](phase2-verification.md) | Historical test results and integration record | Robayth |
| [Docker Compose setup](member2-deployment.md) | API and PostgreSQL startup, readiness and restart checks | Azmain |
| [Database setup](database-setup.md) | PostgreSQL setup, migrations and seed process | Azmain |
| [Robayth AI collaboration](robayth-ai-collaboration.md) | Robayth's recorded AI assistance and engineering review | Robayth |
| [Azmain AI collaboration](azmain-ai-collaboration.md) | Azmain's AI collaboration record | Azmain |

The canonical API description is [`openapi.yaml`](../openapi.yaml) at the repository root.

The active backend is in [`apps/api/`](../apps/api/). Later frontend, foreign-service integration and deployment work belongs to the final-project phase, not the Phase 2 milestone implementation described here.
