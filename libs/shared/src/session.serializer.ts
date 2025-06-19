import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

@Injectable()
export class SessionSerializer extends PassportSerializer {
    serializeUser(user: any, done: (err: Error, user: any) => void): any {
        console.log('Serializing user:', user);
        done(null, { userId: user.userId, email: user.email, role: user.role });
    }

    deserializeUser(payload: any, done: (err: Error, payload: any) => void): any {
        console.log('Deserializing user:', payload);
        done(null, payload);
    }
}