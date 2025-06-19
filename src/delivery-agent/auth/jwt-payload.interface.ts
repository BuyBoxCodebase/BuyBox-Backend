import { Role } from "../../../libs/common/src";

export interface JwtPayload {
  email: string;
  sub: string;
  role: Role;
}


export interface DeliveryAgentActivationTokenPayload {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  code: string;
}
