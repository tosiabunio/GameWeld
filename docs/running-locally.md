# Running GameWeld locally

Run GameWeld on your own machine, with its sample data, to try it or to work on it. You do not need Docker knowledge; the commands below hide it. To look at it without installing anything, use the demonstration instance at [gameweld.eu](https://gameweld.eu).

## Once

1. Install Docker. On macOS, [OrbStack](https://orb.stack) or Docker Desktop provides the `docker` command.
2. Install Node.js 22 or newer.
3. Clone the repository (`git clone https://github.com/tosiabunio/GameWeld.git`) and open a terminal in it.

## Every time

```
make up
```

Builds the application from the current source, starts it with a PostgreSQL database, applies migrations, seeds demo data if the database is empty, and prints the URL. Open http://localhost:8090 and pick a persona on the sign-in page.

Run `make up` again after any code change to see it live. Data you entered by hand is kept.

## Other commands

| Command | What it does |
| --- | --- |
| `make down` | Stops the containers. Data is kept. |
| `make reset` | Deletes all data and starts fresh with the demo project. |
| `make logs` | Follows application logs. Press Ctrl-C to stop following. |
| `make status` | Shows whether the stack is running and the migration version. |
| `make test` | Runs all tests against a throwaway database. The running instance is untouched. |

## Personas

Mock sign-in is enabled only in local and test configuration. The sign-in page offers three seeded personas: Dana Director, Devin Developer, and Tess Tester. "Switch persona" in the header returns to the picker. All three are members of the seeded demo project, which contains the worked example from specification Section 17.

## If something goes wrong

- `make status` tells you whether the containers are up and the app answers.
- `make logs` shows the application output, including migration and seed messages.
- `make reset` is the reliable way back to a known state.

## Changing the port

The app listens on port 8090 by default. If that port is busy, run `APP_PORT=8091 make up` or export `APP_PORT` in your shell.
