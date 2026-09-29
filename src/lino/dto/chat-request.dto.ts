export class ChatRequestDto {
  sessionId: string;
  message: string;
  userId?: string; // optional — populated by the client when user is authenticated
}
