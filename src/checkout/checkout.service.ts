import { Injectable, BadRequestException } from '@nestjs/common';
import * as moment from 'moment-timezone';

@Injectable()
export class CheckoutService {
  calculatePickupDate(orderTimestamp: string) {
    const orderTime = moment.tz(orderTimestamp, 'Africa/Harare');
    
    if (!orderTime.isValid()) {
      throw new BadRequestException('Invalid timestamp');
    }

    const orderDay = orderTime.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    let deliveryDaysOffset = 0;

    // Logic:
    // Mon (1) -> Wed (3) => +2
    // Tue (2) -> Fri (5) => +3
    // Wed (3) -> Fri (5) => +2
    // Thu (4) -> Mon (1) => +4 (Sat delivery -> Sun pickup blocked -> skip to Mon)
    // Fri (5) -> Mon (1) => +3 (Sat delivery -> Sun pickup blocked -> skip to Mon)
    // Sat (6) -> Mon (1) => +2 (Sat delivery -> Sun pickup blocked -> skip to Mon)
    // Sun (0) -> Wed (3) => +3 (Tue delivery -> Wed pickup)

    switch (orderDay) {
      case 0: // Sunday
        deliveryDaysOffset = 3;
        break;
      case 1: // Monday
        deliveryDaysOffset = 2;
        break;
      case 2: // Tuesday
        deliveryDaysOffset = 3;
        break;
      case 3: // Wednesday
        deliveryDaysOffset = 2;
        break;
      case 4: // Thursday
        deliveryDaysOffset = 4;
        break;
      case 5: // Friday
        deliveryDaysOffset = 3;
        break;
      case 6: // Saturday
        deliveryDaysOffset = 2;
        break;
    }

    const pickupDate = orderTime.clone().add(deliveryDaysOffset, 'days');
    
    // Ensure if it falls on Sunday, skip to Monday (though the offsets already handle this, good to be safe)
    if (pickupDate.day() === 0) {
      pickupDate.add(1, 'day');
    }

    return {
      pickupDate: pickupDate.format('YYYY-MM-DD'),
      availableFrom: '09:00',
      availableUntil: '16:00',
      timezone: 'Africa/Harare',
    };
  }
}
