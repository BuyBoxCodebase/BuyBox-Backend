import { Controller, Get, Post, Body, Delete, UseGuards, Patch } from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/create-cart.dto';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("CUSTOMER")
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) { }

  @Post('/add-cart')
  addToCart(@GetUser("userId") userId: string, @Body() addToCartDto: AddToCartDto) {
    return this.cartService.addToCart(userId, addToCartDto);
  }

  @Patch('/remove-item')
  removeItem(@GetUser("userId") userId: string, @Body() body: {
    productId: string;
    variantId?: string;
    quantity?: number;
  }) {
    return this.cartService.removeFromCart(userId, body);
  }

  @Get('/get-my-cart')
  getCart(@GetUser("userId") userId: string) {
    return this.cartService.getCart(userId);
  }

  @Delete('/clear-cart')
  clearCart(@GetUser("userId") userId: string) {
    return this.cartService.clearCart(userId);
  }
}
