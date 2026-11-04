import { CreateOrderDto } from '../../../order/dto/create-order.dto';

// The checkout form as sent for a Cash on Delivery order, plus the EcoCash number to
// charge. paymentMode is set to ECOCASH on the server.
export type InitiateEcocashPaymentDto = Omit<CreateOrderDto, 'paymentMode'> & {
  ecocashNumber: string;
};
