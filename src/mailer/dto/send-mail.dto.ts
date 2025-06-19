export interface SendMailDto {
    email: string,
    mail_file: string,
    subject: string,
    data: Record<string, any>
}