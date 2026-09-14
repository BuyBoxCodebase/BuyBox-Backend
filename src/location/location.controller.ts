import { Controller, Get, Param } from '@nestjs/common';
import { LocationService } from './location.service';

@Controller('api/locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locationService.findOne(id);
  }
}
