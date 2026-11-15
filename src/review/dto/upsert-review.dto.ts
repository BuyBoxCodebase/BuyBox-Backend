export class UpsertReviewDto {
  rating: number;
  comment?: string;
  // Multipart sends every field as text, so this is 'true' when the customer removed their photo
  removeImage?: string;
}
