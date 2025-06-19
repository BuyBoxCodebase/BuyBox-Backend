import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { PrismaService } from '../../../prisma/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        super({
            usernameField: 'email',
        });
    }

    async validate(email: string, password: string): Promise<any> {
        const user = await this.prisma.customer.findUnique({
            where: { email },
        });

        if (!user || !(await argon2.verify(user.password, password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return {
            userId: user.id,
            email: user.email,
            role: 'CUSTOMER',
            ...user
        };
    }
}