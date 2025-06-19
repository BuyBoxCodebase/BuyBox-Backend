import { SetMetadata } from '@nestjs/common';
import { Role } from './roles';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);