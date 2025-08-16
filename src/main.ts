import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['https://buybox-seller-site.vercel.app', 'https://emporiumsc.co.za', 'https://buy-box-seven.vercel.app', 'https://buy-box-git-dev-snaju003s-projects.vercel.app', 'https://www.buybox1.co.za', 'https://seller.buybox1.co.za', 'https://admin.buybox1.co.za', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
