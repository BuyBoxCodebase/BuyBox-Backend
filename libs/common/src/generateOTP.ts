import { randomInt } from 'crypto';

export const generateOTP = (length: number): string => {
    let otp = '';
    for (let index = 0; index < length; index++) {
        otp += randomInt(0, 10).toString();
    }
    return otp;
};
