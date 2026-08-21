import { Inject, Injectable } from '@nestjs/common';
import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary';
import * as streamifier from 'streamifier';
import { CLOUDINARY } from './constants';
@Injectable()
export class CloudinaryService {

    constructor(@Inject(CLOUDINARY) private cloudinary) { }

    async uploadImages(
        files: Array<Express.Multer.File>,
    ): Promise<(UploadApiResponse | UploadApiErrorResponse)[]> {
        const promises = files.map((file: Express.Multer.File) => {
            return new Promise<UploadApiResponse | UploadApiErrorResponse>((resolve, reject) => {
                const upload = v2.uploader.upload_stream((error, result) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(result);
                });
                streamifier.createReadStream(file.buffer).pipe(upload);
            });
        })
        return Promise.all(promises);
    }

    async uploadVideos(
        files: Array<Express.Multer.File>,
    ): Promise<(UploadApiResponse | UploadApiErrorResponse)[]> {
        const promises = files.map((file: Express.Multer.File) => {
            return new Promise<UploadApiResponse | UploadApiErrorResponse>((resolve, reject) => {
                const upload = v2.uploader.upload_stream({ resource_type: 'video' }, (error, result) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(result);
                });
                streamifier.createReadStream(file.buffer).pipe(upload);
            });
        })
        return Promise.all(promises);
    }
}