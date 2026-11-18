# Treides Backend Documentation

## Overview

**Treides Backend** is the core server-side application powering the Treides multi-vendor eCommerce marketplace.

Built using **NestJS and TypeScript**, the backend provides the infrastructure required to manage customers, sellers, products, inventory, orders, payments, notifications and AI-powered shopping experiences.

Treides is designed to connect independent sellers with customers through a unified marketplace, simplifying product discovery, purchasing and delivery.

The backend follows a modular architecture, separating business domains into independent modules while maintaining shared infrastructure and services.

It also powers **Lino**, Treides' AI shopping assistant, which interprets customer intent and interacts with marketplace services to deliver personalized product discovery.

---

## Architecture

The backend follows a modular, service-oriented architecture built around NestJS.

Core architectural components:

- **API Layer:** Handles incoming HTTP requests and exposes RESTful endpoints.
- **Business Logic Layer:** Contains application rules and domain-specific operations.
- **Data Access Layer:** Uses Prisma to interact with MongoDB.
- **Integration Layer:** Connects external services such as payment providers, notification providers and AI APIs.
- **Background Processing Layer:** Uses BullMQ and Redis for asynchronous jobs and event processing.
- **AI Orchestration Layer:** Powers Lino's intent extraction, product discovery and conversational shopping capabilities.

---

## Project Structure

The project is organized into the following directories:

- `src`: Main application source code and business modules.
- `libs`: Shared libraries, utilities and reusable services.
- `test`: Unit tests, integration tests and end-to-end tests.
- `prisma`: Prisma schema, database configuration and related resources.

### Core Application Structure

```text
src/
├── app.module.ts
├── customer/
├── seller/
├── product/
├── category/
├── order/
├── payment/
├── notification/
├── inventory/
├── delivery/
├── analytics/
├── lino/
├── common/
└── prisma/
```

*This represents the logical module organization; the actual repository structure may contain additional modules and submodules.*

---

## Core Modules

### 1. Customer Module

Manages customer-related operations.

Responsibilities:
- Customer registration and authentication.
- Google sign-in.
- Customer profile management.
- Customer account information.
- Shopping preferences.
- Customer order history.
- Product watch subscriptions.

### 2. Seller Module

Manages independent sellers participating in the Treides marketplace.

Responsibilities:
- Seller registration and authentication.
- Seller profile management.
- Seller onboarding.
- Seller product management.
- Seller inventory operations.
- Seller order management.
- Seller-specific marketplace operations.

### 3. Product Module

Manages the marketplace product catalogue.

Responsibilities:
- Product creation and management.
- Product retrieval and discovery.
- Product categorization and subcategorization.
- Brand management.
- Product descriptions and metadata.
- Product variants.
- Product pricing.
- Product availability.
- Product-to-seller relationships.

Supports products with multiple variants, including sizes, colours and other configurable attributes.

### 4. Inventory Module

Manages product stock and availability across marketplace sellers.

Responsibilities:
- Stock quantity management.
- Inventory updates.
- Variant-level inventory.
- Out-of-stock detection.
- Restocking operations.
- Product availability events.
- Cross-seller availability matching.

The inventory module is particularly important for marketplace-wide product discovery and notification workflows.

### 5. Order Module

Handles the order lifecycle between customers and sellers.

Responsibilities:
- Order creation.
- Order validation.
- Order management.
- Order status updates.
- Seller order fulfilment.
- Order cancellation.
- Returns management.
- Order history.
- Customer and seller order notifications.

### 6. Payment Module

Manages payment-related operations and external payment integrations.

Responsibilities:
- Payment initiation.
- Payment verification.
- Transaction management.
- Payment status tracking.
- Payment reconciliation.
- Refund workflows.
- Payment provider integrations.

The architecture is intended to support Zimbabwean payment methods, including EcoCash, alongside future payment integrations.

### 7. Notification Module

Manages communication between Treides and its customers and sellers.

Responsibilities:
- WhatsApp notifications.
- Email notifications.
- Order updates.
- Payment notifications.
- Product availability notifications.
- Seller notifications.
- Notification history.
- Delivery status tracking.
- Notification preferences.

The module integrates with asynchronous job processing to support reliable notification delivery.

### 8. Product Watch Module

Supports customers who want to be notified when unavailable products become available.

Responsibilities:
- Create product watch subscriptions.
- Monitor product availability events.
- Match watched products across multiple sellers.
- Match specific product variants.
- Trigger notification jobs.
- Prevent duplicate notifications.
- Manage subscription status.
- Support product watching through Lino.

The objective is to allow customers to watch a product across the entire marketplace rather than being restricted to one seller's inventory.

### 9. Lino Module

Powers Treides' AI-assisted shopping experience.

Lino is designed to understand customer intent and translate natural language requests into structured marketplace searches.

Responsibilities:
- Natural language understanding.
- Shopping intent extraction.
- Structured intent generation.
- Product search orchestration.
- Product relevance and ranking.
- Context-aware shopping assistance.
- Conversational product discovery.
- Product watch interactions.

**Current AI stack:**
- OpenAI API.
- GPT-4o-mini.
- Structured intent extraction.
- Zod-based validation.
- NestJS marketplace service integrations.

Lino operates through controlled backend tools and services rather than unrestricted database access.

### 10. Delivery Module

Manages delivery and collection workflows.

Responsibilities:
- Delivery method selection.
- Pickup point management.
- Delivery pricing.
- Hub-to-hub transfers.
- Distance-based delivery pricing.
- Delivery status updates.
- Delivery coordination.
- Customer delivery notifications.

### 11. Analytics Module

Provides operational and marketplace insights.

Responsibilities:
- Sales analytics.
- Order analytics.
- Product performance.
- Seller performance.
- Customer activity.
- Marketplace performance.
- Revenue and transaction reporting.

Google Analytics may be used for website analytics and customer behaviour tracking.

---

## Technical Stack

### Core Backend

| Technology | Purpose |
|---|---|
| NestJS | Backend application framework |
| TypeScript | Primary programming language |
| Node.js | Runtime environment |
| Prisma | ORM and database access |
| MongoDB | Primary database |
| REST APIs | Client-server communication |

### Background Processing

| Technology | Purpose |
|---|---|
| BullMQ | Background job processing |
| Redis | Queue storage and job coordination |
| Dedicated workers | Asynchronous job execution |

Background workers are designed to operate independently of serverless API functions.

### External Integrations

| Technology | Purpose |
|---|---|
| OpenAI | AI-powered shopping intelligence |
| Cloudinary | Image storage and processing |
| WhatsApp Business Platform | Customer and seller communication |
| Google Analytics | Website analytics |
| EcoCash | Mobile money payment integration |

### Infrastructure

| Technology | Purpose |
|---|---|
| Vercel | Application and API hosting |
| Railway | Dedicated background worker hosting |
| Redis hosting provider | Queue infrastructure |
| MongoDB hosting provider | Database infrastructure |

Some infrastructure integrations are under development and may change as the platform evolves.

---

## Background Job Architecture

Treides uses BullMQ and Redis to process asynchronous operations.

Examples include:

- Product availability notifications.
- Order notifications.
- Payment-related background tasks.
- Automated communication.
- Other event-driven marketplace operations.

The architecture separates job producers from job consumers.

**Job producer:**
The NestJS API creates and publishes jobs.

**Job consumer:**
A dedicated worker processes jobs independently of the API deployment.

This separation prevents persistent background processes from being tied to serverless request lifecycles.

---

## Database

Treides uses MongoDB as its primary database, with Prisma providing structured database access.

Core data domains include:

- Customers.
- Sellers.
- Products.
- Categories.
- Product variants.
- Inventory.
- Orders.
- Payments.
- Notifications.
- Product watch subscriptions.
- Delivery information.

The database is designed to support relationships between customers, sellers, products, variants and transactions across the marketplace.

---

## Installation

### Prerequisites

- Node.js v22 or compatible project-supported version.
- Yarn.
- MongoDB connection.
- Redis connection.
- Required environment variables.

### Install dependencies

```bash
yarn install
```

### Configure environment variables

Create a `.env` file containing the required application configuration.

Example:

```env
DATABASE_URL=
REDIS_URL=
OPENAI_API_KEY=
NEXT_PUBLIC_BACKEND_URL=
REVALIDATION_SECRET=
```

Additional credentials are required for external integrations such as Cloudinary, WhatsApp and payment providers.

Use the actual environment variable names defined by the project.

### Generate Prisma Client

```bash
npx prisma generate
```

### Run the application

```bash
yarn start:dev
```

### Build for production

```bash
yarn build
```

---

## Testing

Run unit tests:

```bash
yarn test
```

Run end-to-end tests:

```bash
yarn test:e2e
```

Run test coverage:

```bash
yarn test:cov
```

---

## API Documentation

Treides exposes RESTful APIs consumed by the frontend and other authorized services.

API documentation is available through Swagger:

```text
/api/docs
```

The exact endpoint depends on the deployed backend base URL.

---

## Deployment

The backend application and background processing infrastructure are deployed independently.

### API Deployment
The NestJS API is deployed through Vercel.

### Worker Deployment
Dedicated BullMQ workers are deployed separately using infrastructure such as Railway.

### Database and Queue Infrastructure
MongoDB stores marketplace data, while Redis coordinates background jobs.

This separation allows the API and background processing services to scale independently.

---

## Development Principles

The backend is designed around the following principles:

- **Modularity:** Business domains should remain logically separated.
- **Scalability:** Services should support increasing marketplace activity.
- **Reliability:** Critical operations should include appropriate validation, retries and failure handling.
- **Security:** Authentication, authorization and transaction integrity are essential.
- **Maintainability:** Shared logic should be reusable and well structured.
- **Performance:** Database queries, API responses and background jobs should be optimized.
- **Event-driven architecture:** Important marketplace events should trigger appropriate asynchronous workflows.

---

## Contributing

Contributions to the project are welcome.

Developers should:
- Follow the existing module architecture.
- Maintain consistent TypeScript conventions.
- Validate incoming data.
- Write appropriate unit and integration tests.
- Avoid duplicating business logic.
- Document significant architectural changes.
- Ensure existing functionality is not broken by new changes.

---

## License

MIT License © 2026 Treides.

See the `LICENSE` file for details.
