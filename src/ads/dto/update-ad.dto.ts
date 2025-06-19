import { PartialType } from '@nestjs/mapped-types';
import { CreateAdvertisementDto } from './create-ad.dto';

export class UpdateAdvertisementDto extends PartialType(CreateAdvertisementDto) { }