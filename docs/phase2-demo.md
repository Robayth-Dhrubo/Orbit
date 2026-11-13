# Phase 2 demonstration

Allow five to seven minutes. Run the commands from the repository root. Start and seed the service using the [Compose guide](member2-deployment.md) or the [local Node and PostgreSQL setup](database-setup.md). Keep the chosen demo password in the shell variable `DEMO_PASSWORD`. For local Node setup, use the value you configured in `apps/api/.env`.

This is a repeatable demonstration procedure. Actual execution evidence is recorded in [the verification record](phase2-verification.md); the team still presents the milestone itself.

## 1. Show the running service and architecture

```sh
export API_URL="http://localhost:${ORBIT_API_PORT:-3000}"
curl -i "$API_URL/health"
curl -i "$API_URL/ready"
```

Open `/docs` in your browser using the API base URL. The source is [`openapi.yaml`](../openapi.yaml), also available at `/openapi.yaml`.

Show the eight auth/domain operations and explain:

```text
HTTP routes/controllers → domain services → repositories → PostgreSQL
```

The core routes/services are in `apps/api/src/team-api`, concrete auth/data/atomic modules in `apps/api/src`, and ordered schema files in `database/migrations`. Booking state is stored in PostgreSQL.

## 2. Register and authenticate

Register a student with a fresh email and a local password of at least 12 characters (at most 72 UTF-8 bytes). Replace the example values before running:

```sh
curl -i "$API_URL/auth/register" \
  -H 'Content-Type: application/json' \
  --data '{"email":"demo.student@orbit.test","password":"YOUR_LOCAL_DEMO_PASSWORD","role":"student"}'
```

Expect `201`; repeating the normalized email returns `409`. The result contains `user`, **`token`**, `tokenType` and `expiresIn`, without password hashes. Tutor registration additionally requires `role: tutor` and `displayName`.

Log in as the seeded tutor using `DEMO_PASSWORD`:

```sh
node -e 'process.stdout.write(JSON.stringify({email:"tutor@orbit.test",password:process.env.DEMO_PASSWORD}))' |
  curl -sS "$API_URL/auth/login" -H 'Content-Type: application/json' --data-binary @-
```

Copy the response's `token` into a shell variable:

```sh
export TUTOR_TOKEN='PASTE_TUTOR_TOKEN'
```

## 3. Publish availability

```sh
curl -sS "$API_URL/tutors"
export TUTOR_ID=10000000-0000-4000-8000-000000001001
node -e 'process.stdout.write(JSON.stringify({startTime:new Date(Date.now()+86400000).toISOString(),endTime:new Date(Date.now()+90000000).toISOString()}))' |
  curl -i "$API_URL/tutors/$TUTOR_ID/slots" \
    -H "Authorization: Bearer $TUTOR_TOKEN" \
    -H 'Content-Type: application/json' --data-binary @-
```

`TUTOR_ID` above is the seeded tutor's **profile ID**, distinct from the account ID. Expect `201` and record the returned slot ID:

```sh
export SLOT_ID='PASTE_CREATED_SLOT_UUID'
curl -sS "$API_URL/tutors/$TUTOR_ID/slots"
```

Publishing an overlapping interval returns `409 SLOT_OVERLAP`. A second tutor cannot publish for this profile (`403`); students cannot publish slots (`403`).

## 4. Book, replay, and isolate ownership

Log in as Student A using the same command as the tutor login, changing the email to `student.a@orbit.test`, and save the returned token:

```sh
export TOKEN_A='PASTE_STUDENT_A_TOKEN'
BOOKING_KEY="phase2-demo-$(node -e 'process.stdout.write(crypto.randomUUID())')"
curl -i "$API_URL/appointments" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $BOOKING_KEY" \
  --data "{\"slotId\":\"$SLOT_ID\",\"topic\":\"SOEN 387 concurrency demo\"}"
```

Expect `201` and record the returned `appointmentId`:

```sh
export APPOINTMENT_ID='PASTE_APPOINTMENT_UUID'
curl -sS "$API_URL/appointments" -H "Authorization: Bearer $TOKEN_A"
```

Repeat the booking command unchanged: expect the same appointment ID. Change the topic while retaining the key: expect `409 IDEMPOTENCY_CONFLICT`. The booked slot disappears from the available-slot list.

Log in as `student.b@orbit.test` and save `TOKEN_B`. Their list must exclude Student A's appointment:

```sh
export TOKEN_B='PASTE_STUDENT_B_TOKEN'
curl -sS "$API_URL/appointments" -H "Authorization: Bearer $TOKEN_B"
curl -i -X DELETE "$API_URL/appointments/$APPOINTMENT_ID" \
  -H "Authorization: Bearer $TOKEN_B"
```

The deletion returns `404`. Student B booking the same occupied slot with a different idempotency key returns `409 SLOT_ALREADY_BOOKED`. Requesting `/appointments` without the Authorization header returns `401`.

## 5. Show persistence, cancellation, and rebooking

Restart **only the API**, using `docker compose restart api` or restarting the local Node process. Keep PostgreSQL running. Log in again as Student A and show the same confirmed appointment in `/appointments`.

```sh
curl -i -X DELETE "$API_URL/appointments/$APPOINTMENT_ID" \
  -H "Authorization: Bearer $TOKEN_A"
```

Repeat the owner's cancellation: both responses are `204`. The future slot becomes available again. Book with a new key and confirm a new appointment ID.

A retry with the original successful booking key still returns its original stored receipt after cancellation. `GET /appointments` supplies current state. This makes retries deterministic while preserving appointment history.

## 6. Demonstrate concurrent safety

```sh
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/orbit_test'
npm --prefix apps/api ci
npm run test:integration
npm run test:race
```

The standalone race creates a disposable fixture. It must produce one `201`, nineteen `409` responses and exactly one confirmed PostgreSQL row. Explain why checking availability without a database lock would allow simultaneous requests to race. Booking and cancellation serialize on the same slot row; the partial unique index independently protects the invariant.

Show the passing integration output for real login/JWT/application wiring, ownership, replay, overlap protection and persistence. Only claim further cases present in the recorded results for the demonstrated revision.

## Repeat the demo

Use fresh account emails, future slots and new idempotency keys, or stop the API and explicitly reset the seeded fixture:

```sh
npm --prefix apps/api run db:reset -- --confirm
```

Reset removes demo students' bookings/keys and bookings using the two seeded slots, including other users' bookings on those slots. Normal `db:seed` preserves bookings. The automated race does not consume seeded slots.

Record the tested revision, database version, commands and results in the verification record. Frontend, email integration and production deployment remain later-phase work.
