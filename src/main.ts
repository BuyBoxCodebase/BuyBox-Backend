import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as session from 'express-session';
import * as MongoDBStore from 'connect-mongodb-session';
import * as passport from 'passport';
import * as cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configure Sessions
  const MongoStore = MongoDBStore(session);
  const store = new MongoStore({
    uri: configService.get<string>('DATABASE_URL'),
    collection: 'sessions',
  });

  // Configure session middleware
  app.use(
    session({
      secret: configService.get<string>('SESSION_SECRET') || 'your-secret-key',
      resave: false,
      saveUninitialized: false,
      name: "buybox-session",
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "lax",
      },
      store: store,
    }),
  );

  // Initialize passport and session
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(cookieParser());

  app.enableCors({
    origin: ['https://buybox-seller-site.vercel.app', 'https://emporiumsc.co.za', 'https://buy-box-seven.vercel.app', 'https://buy-box-git-dev-snaju003s-projects.vercel.app', 'https://www.buybox1.co.za', 'https://seller.buybox1.co.za', 'https://admin.buybox1.co.za', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
