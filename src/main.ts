import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Exact origins plus Vercel preview deploys. Apex is listed alongside www:
// the page redirects apex -> www, but a request already issued from the apex
// origin is still checked against this list.
const ALLOWED_ORIGINS = [
  'https://buyboxie.com',
  'https://www.buyboxie.com',
  'https://seller.buyboxie.com',
  'https://admin.buyboxie.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:3001',
  ];

const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin(origin, callback) {
      // No Origin header: server-to-server, curl, same-origin. Not a CORS request.
      if (!origin) return callback(null, true);
      const ok = ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin);
      // Reject by omitting the header rather than throwing, so the browser
      // reports a clean CORS block instead of a 500.
      callback(null, ok);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
