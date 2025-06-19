import { v2 } from 'cloudinary';
import { CLOUDINARY } from './constants';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const CloudinaryProvider = {
    provide: CLOUDINARY,
    useFactory: (configService: ConfigService) => {

        const config = v2.config({
            cloud_name: configService.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: configService.get<string>('CLOUDINARY_API_KEY'),
            api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
        });
        return config;
    },
    inject: [ConfigService]
};