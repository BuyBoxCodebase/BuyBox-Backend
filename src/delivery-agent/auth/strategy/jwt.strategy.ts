import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { JwtPayload } from '../jwt-payload.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { Admin, Customer, DeliveryAgent, Seller } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const { sub: userId, email, role } = payload;
    let user: Customer | Seller | DeliveryAgent | Admin;

    if (role === "CUSTOMER") {
      user = await this.prisma.customer.findUnique({
        where: { id: userId },
      });
    } else if (role === "SELLER") {
      user = await this.prisma.seller.findUnique({
        where: { id: userId },
      });
    } else if (role === "DELIVERY_AGENT") {
      user = await this.prisma.deliveryAgent.findUnique({
        where: { id: userId },
      });
    } else if (role === "ADMIN") {
      user = await this.prisma.admin.findUnique({
        where: { id: userId, role: "ADMIN", isVerified: true },
      });
    } else if (role === "SUPER_ADMIN") {
      user = await this.prisma.admin.findUnique({
        where: { id: userId, role: "SUPER_ADMIN" },
      });
    } else {
      throw new UnauthorizedException('Invalid role');
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { userId, email, role, ...user };
  }
}
