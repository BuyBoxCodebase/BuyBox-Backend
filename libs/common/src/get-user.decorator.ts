import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: keyof { userId: string; email: string; role: string } | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.isAuthenticated()) {
      return null;
    }
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
