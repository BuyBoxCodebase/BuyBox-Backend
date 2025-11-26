

# BuyBox Backend Documentation

## Overview

BuyBox Backend is a server-side application built using the NestJS framework, providing a scalable and efficient solution for managing e-commerce operations. This documentation provides an overview of the project's architecture, features, and technical details.

## Project Structure

The project is organized into the following modules:

* `src`: Contains the application's source code.
* `libs`: Contains shared libraries and utilities.
* `test`: Contains unit tests and integration tests.

## Modules

The application is composed of the following modules:

* `app.module`: The main application module, responsible for bootstrapping the application.
* `customer.module`: Handles customer-related operations, such as authentication and profile management.
* `seller.module`: Handles seller-related operations, such as authentication and profile management.
* `product.module`: Manages product-related operations, such as product creation and retrieval.
* `order.module`: Handles order-related operations, such as order creation and fulfillment.
* `payment.module`: Handles payment-related operations, such as payment processing and refund management.
* `notification.module`: Handles notification-related operations, such as sending emails and SMS notifications.
* `analytics.module`: Provides analytics and insights for the application.

## Features

The application provides the following features:

* User authentication and authorization
* Product management
* Order management
* Payment processing
* Notification system
* Analytics and insights

## Technical Details

* The application uses NestJS as the framework, with TypeScript as the primary language.
* The database is managed using Prisma, with PostgreSQL as the underlying database.
* The application uses Cloudinary for image storage and processing.
* The notification system uses Bull Queue for job processing and Mailgun for email sending.
* The analytics system uses Google Analytics for data collection and visualization.

## Installation

To install the application, run the following command:
```bash
yarn
```
## Running the Application

To run the application, use the following command:
```bash
yarn start:dev
```
## Testing

To run unit tests and integration tests, use the following command:
```bash
yarn test
```
## Deployment

The application can be deployed to a production environment using the following command:
```bash
yarn build
```
This will create a production-ready build of the application, which can be deployed to a server or cloud platform.

## API Documentation

The application provides a RESTful API for interacting with the backend. The API documentation can be found at `/api/docs`.

## Contributing

Contributions to the project are welcome. Please submit a pull request with your changes, and ensure that all tests pass before submitting.

## License

The project is licensed under the MIT License. See `LICENSE` for details.
