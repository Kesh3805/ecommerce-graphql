# GK POC GraphQL Service

NestJS + GraphQL API service built as a proof of concept — a multi-tenant e-commerce backend where store owners can manage products, categories, variants, and inventory.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: NestJS 10
- **API**: GraphQL (Code-first via `@nestjs/graphql` + Apollo Server 4)
- **Database**: PostgreSQL on [Neon](https://neon.tech) + Prisma ORM 7
- **Auth**: JWT (Passport.js) — role-based (`ADMIN`, `STORE_OWNER`)
- **Language**: TypeScript 5

## Data Model

```
User ──< Store ──< Product ──< Variant ──< InventoryItem
                      │
                      ├──< ProductOption ──< OptionValue
                      ├──< ProductCategory >── Category (hierarchy)
                      ├──< ProductAttributeValue
                      └──  ProductSEO

User ──< Customer ──< Cart ──< CartItem >── Variant
                  └──< Order ──< OrderItem >── Variant

Metafield (polymorphic: owner_type / owner_id)
```

## Project Structure

```
src/
├── main.ts                     # Application bootstrap
├── app.module.ts               # Root dynamic module (forRoot pattern)
├── health.controller.ts        # GET /health endpoint
├── schema.gql                  # Auto-generated GraphQL schema (code-first)
├── common/
│   ├── constants/              # App-wide constants and error messages
│   ├── decorators/             # @CurrentUser decorator
│   ├── filters/                # Global exception filter (HTTP + GraphQL)
│   ├── guards/                 # JWT Auth Guard (GraphQL context-aware)
│   ├── interceptors/           # Logging interceptor
│   ├── interfaces/             # Shared TypeScript interfaces
│   └── logger/                 # Custom logger with sensitive field masking
├── prisma/
│   ├── prisma.service.ts       # PrismaClient wrapper with NestJS lifecycle hooks
│   └── prisma.module.ts        # Global PrismaModule (exported app-wide)
└── modules/
    ├── auth/                   # JWT login mutation + Passport strategy
    │   ├── dto/                # LoginInput, AuthPayload
    │   ├── strategies/         # jwt.strategy.ts
    │   ├── auth.resolver.ts
    │   ├── auth.service.ts
    │   └── auth.module.ts
    └── user/                   # User CRUD with GraphQL resolvers
        ├── dto/                # CreateUserInput, UpdateUserInput, GetUsersInput, PaginatedUsersResponse
        ├── entities/           # User GraphQL ObjectType + UserRole enum
        ├── repository/         # Prisma-backed data access layer
        ├── user.resolver.ts
        ├── user.service.ts
        └── user.module.ts

prisma/
├── schema.prisma               # Full e-commerce data model
├── seed.ts                     # Dev seed: users, stores, categories, products, variants
prisma.config.ts                # Prisma 7 config (datasource URL, migrations, seed command)
```

## Architecture Patterns

| Pattern | Implementation |
|---------|---------------|
| Module structure | `module / service / resolver / repository / entity / dto` |
| Root module | `AppModule.forRoot()` dynamic module factory |
| Database access | Prisma ORM 7 via global `PrismaService` |
| ORM config | `prisma.config.ts` — URL in config, not in schema (Prisma 7 requirement) |
| Prisma client | Default output (`node_modules/@prisma/client`) — works seamlessly with `dist/` |
| Auth | JWT Passport strategy; `JwtAuthGuard` reads from GraphQL context |
| Roles | `UserRole` enum: `ADMIN`, `STORE_OWNER` |
| Response | Resolvers return typed GraphQL `ObjectType`s |
| Validation | `class-validator` on `@InputType()` DTOs |
| Logging | `CustomLoggerService` (ConsoleLogger + sensitive field masking) |
| Error handling | `AllExceptionsFilter` — HTTP + GraphQL unified |
| Pagination | `PaginatedResponse<T>` with nested `pagination` meta object |
| Config | `@nestjs/config` — `ConfigModule.forRoot({ isGlobal: true })` |

## GraphQL API

### Auth Mutations

```graphql
mutation Login {
  login(input: { email: "alice@example.com", password: "password123" }) {
    accessToken
    tokenType
    expiresIn
  }
}
```

### User Mutations

```graphql
mutation CreateUser {
  createUser(input: {
    name: "Jane Doe"
    email: "jane@example.com"
    password: "secret123"
    role: STORE_OWNER
  }) {
    id
    name
    email
    role
    status
    createdAt
  }
}

# Header: Authorization: Bearer <token>
mutation UpdateUser {
  updateUser(input: { id: 1, name: "Alice Updated" }) {
    id
    name
    email
  }
}
```

### User Queries

```graphql
# Header: Authorization: Bearer <token>
query Me {
  me {
    id
    name
    email
    role
  }
}

query Users {
  users(input: { page: 1, limit: 10, search: "alice" }) {
    data {
      id
      name
      email
      role
    }
    pagination {
      total
      page
      totalPages
      hasNextPage
    }
  }
}
```

## Seeded Dev Data

| User | Password | Role | Store |
|------|----------|------|-------|
| alice@example.com | password123 | STORE_OWNER | Alice's Apparel |
| bob@example.com | password123 | STORE_OWNER | Bob's Electronics |

Seeded products: Classic Cotton Tee, Urban Hoodie, ProPhone X, UltraBook Pro 15 — with variants, inventory levels, SEO, attributes, and category links.

## Getting Started

### Prerequisites
- Node.js 20+
- A PostgreSQL database (project uses [Neon](https://neon.tech) — set `DATABASE_URL` in `.env`)

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Set DATABASE_URL to your PostgreSQL connection string
   ```

3. **Push schema & generate client**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

4. **Seed dev data**
   ```bash
   npx prisma db seed
   ```

5. **Start the app**
   ```bash
   npm run start:dev
   ```

6. **Open GraphQL Playground**
   ```
   http://localhost:3000/graphql
   ```

7. **Health check**
   ```
   GET http://localhost:3000/health
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Build to `dist/` |
| `npm run start:prod` | Start production build |
| `npm run type-check` | TypeScript type check only |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier formatting |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Tests with coverage |
| `npx prisma db push` | Sync schema to database |
| `npx prisma generate` | Regenerate Prisma Client |
| `npx prisma db seed` | Run seed script |
| `npx prisma studio` | Open Prisma Studio GUI |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` \| `production` |
| `PORT` | HTTP port (default: `3000`) |
| `DATABASE_URL` | PostgreSQL connection string (supports Neon pooler) |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | Token expiry (default: `30d`) |
| `GRAPHQL_PLAYGROUND` | Enable playground (`true`/`false`) |
| `GRAPHQL_INTROSPECTION` | Enable introspection (`true`/`false`) |
| `LOG_LEVEL` | `error` \| `warn` \| `info` \| `debug` |


## Project Structure

```
src/
├── main.ts                     # Application bootstrap
├── app.module.ts               # Root dynamic module (forRoot pattern)
├── health.controller.ts        # GET /health endpoint
├── schema.gql                  # Auto-generated GraphQL schema (code-first)
├── generated/prisma/           # Auto-generated Prisma Client (gitignored)
├── common/
│   ├── constants/              # App-wide constants and error messages
│   ├── decorators/             # Custom decorators (@CurrentUser)
│   ├── filters/                # Global exception filter (HTTP + GraphQL aware)
│   ├── guards/                 # JWT Auth Guard (GraphQL context-aware)
│   ├── interceptors/           # Logging interceptor (HTTP + GraphQL)
│   ├── interfaces/             # Shared TypeScript interfaces
│   └── logger/                 # Custom logger service (sensitive data masking)
├── prisma/
│   ├── prisma.service.ts       # PrismaClient wrapper with NestJS lifecycle hooks
│   └── prisma.module.ts        # Global PrismaModule (exported app-wide)
└── modules/
    ├── auth/                   # JWT login mutation + strategy
    │   ├── dto/                # LoginInput, AuthPayload types
    │   ├── strategies/         # Passport JWT strategy
    │   ├── auth.resolver.ts
    │   ├── auth.service.ts
    │   └── auth.module.ts
    └── user/                   # User CRUD with GraphQL resolvers
        ├── dto/                # Input types and response types
        ├── entities/           # TypeORM entity (also GraphQL ObjectType)
        ├── repository/         # Data access layer
        ├── user.resolver.ts
        ├── user.service.ts
        └── user.module.ts
```

**Prisma schema:** [`prisma/schema.prisma`](prisma/schema.prisma)  
**Prisma config:** [`prisma.config.ts`](prisma.config.ts) (Prisma 7 — datasource URL lives here, not in schema)

## Architecture Patterns

Following the same conventions as QuestQR-API:

| Pattern | Implementation |
|---------|---------------|
| Module structure | `module / service / resolver / repository / entity / dto` |
| Root module | `AppModule.forRoot()` dynamic module factory |
| Database access | Prisma ORM 7 via `PrismaService` (global module) |
| ORM config | `prisma.config.ts` — datasource URL, migrations path, schema location |
| Logging | `CustomLoggerService` extending `ConsoleLogger` with sensitive field masking |
| Error handling | `AllExceptionsFilter` catching both HTTP + GraphQL errors |
| Auth | JWT Passport strategy with `JwtAuthGuard` overriding `getRequest` for GQL context |
| Response | GraphQL resolvers return typed ObjectTypes directly |
| Validation | `class-validator` decorators on `@InputType()` DTOs |
| Config | `@nestjs/config` with `ConfigModule.forRoot({ isGlobal: true })` |

## GraphQL API

### Schema Highlights

**Mutations:**
- `login(input: LoginInput): AuthPayload` — Public authentication
- `createUser(input: CreateUserInput): User` — Public registration
- `updateUser(input: UpdateUserInput): User` — Protected (JWT)
- `removeUser(id: ID!): Boolean` — Protected (JWT)

**Queries:**
- `users(input: GetUsersInput): PaginatedUsersResponse` — Protected (JWT)
- `user(id: ID!): User` — Protected (JWT)
- `me: User` — Protected (JWT), returns current user

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Start the database** (via Docker)
   ```bash
   docker-compose up postgres -d
   ```

4. **Start the app**
   ```bash
   npm run start:dev
   ```

5. **Open GraphQL Playground**
   ```
   http://localhost:3000/graphql
   ```

6. **Health check**
   ```
   GET http://localhost:3000/health
   ```

### Run with Docker Compose (full stack)
```bash
docker-compose up
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Build to `dist/` |
| `npm run start:prod` | Start production build |
| `npm run type-check` | TypeScript validation only |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier formatting |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | HTTP port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | Database username |
| `DB_PASS` | — | Database password |
| `DB_NAME` | `gk_poc_graphql` | Database name |
| `JWT_SECRET` | — | JWT signing secret |
| `JWT_EXPIRES_IN` | `30d` | Token expiry |
| `GRAPHQL_PLAYGROUND` | `true` | Enable playground |
| `GRAPHQL_INTROSPECTION` | `true` | Enable introspection |
| `LOG_LEVEL` | `info` | `error\|warn\|info\|debug` |

## Example GraphQL Operations

### Login
```graphql
mutation {
  login(input: { email: "admin@example.com", password: "password123" }) {
    accessToken
    tokenType
    expiresIn
  }
}
```

### Create User
```graphql
mutation {
  createUser(input: { name: "John Doe", email: "john@example.com", password: "secret123", role: USER }) {
    id
    name
    email
    role
    createdAt
  }
}
```

### Get Users (authenticated)
```graphql
# Header: Authorization: Bearer <token>
query {
  users(input: { page: 1, limit: 10, search: "john" }) {
    data {
      id
      name
      email
      role
    }
    pagination {
      total
      page
      totalPages
      hasNextPage
    }
  }
}
```
