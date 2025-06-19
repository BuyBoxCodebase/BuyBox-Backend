import { BadRequestException, Body, Controller, Get, Patch, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AdminProfileService } from './profile.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { GetUser, Roles, RolesGuard } from '../../../libs/common/src';
import { SessionAuthGuard } from '../../../libs/shared/src';

@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('admin/profile')
export class AdminProfileController {
    constructor(private readonly adminProfileService: AdminProfileService) { }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Post("/upload/images")
    @UseInterceptors(FilesInterceptor('files', 1, {
        fileFilter(req, file, callback) {
            if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
                return callback(new BadRequestException('Only JPG, JPEG, and PNG files are allowed!'), false);
            }
            callback(null, true);
        },
    }))
    uploadProfileImages(@UploadedFiles() files: Array<Express.Multer.File>) {
        return this.adminProfileService.uploadProfileImage(files);
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Get("/get-details")
    getProfile(@GetUser("userId") userId: string) {
        return this.adminProfileService.getProfile(userId);
    }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Patch('/update')
    updateProfile(@GetUser("userId") userId: string, @Body() body: { name: string; profilePic: string; }) {
        return this.adminProfileService.updateProfile(userId, body);
    }
}
