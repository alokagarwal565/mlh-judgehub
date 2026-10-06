# MLH JudgeHub

A real-time, all-in-one platform for **MLH-style hackathon judging**.

Judges can evaluate projects, assign scores, and flag submissions — all with live updates powered by Socket.io.

## Repository Layout

```
mlh-judgehub/
├── client/   → React + Vite front-end (submission UI, live results, dashboards)
├── server/   → Express + TypeScript back-end (auth, Prisma DB, Socket.io, CSV import)
└── README.md
```

## Tech Stack

| Layer       | Technology                                       |
|-------------|--------------------------------------------------|
| Front-end   | React 19, Vite 6, React Router, Axios, Socket.io |
| Back-end    | Express 4, TypeScript, Prisma ORM, Socket.io     |
| Auth        | JWT + bcrypt                                     |
| Database    | PostgreSQL (via Prisma)                          |
| Deployment  | Vercel (client + server)                         |

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- A PostgreSQL database (or use Prisma with SQLite for local dev)

### Setup

```bash
# Clone the repo
git clone https://github.com/alokagarwal565/mlh-judgehub.git
cd mlh-judgehub

# Install client dependencies
cd client && npm install

# Install server dependencies
cd ../server && npm install

# Set up environment variables
cp .env.example .env   # edit with your DB URL, JWT secret, etc.

# Push the Prisma schema to the database
npm run db:push

# (Optional) Seed with sample data
npm run db:seed
```

### Development

```bash
# In one terminal — start the server
cd server && npm run dev

# In another terminal — start the client
cd client && npm run dev
```

## Features

- 🏆 **Real-time judging** — scores and flags update instantly via WebSockets
- 👥 **Judge & team management** — CSV import for bulk onboarding
- 📊 **Live leaderboard** — dynamic rankings across events
- 🔐 **Secure auth** — JWT-based authentication with bcrypt password hashing
- 🗂️ **Multi-event support** — manage multiple hackathons from a single instance

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT © 2026 MLH JudgeHub contributors
