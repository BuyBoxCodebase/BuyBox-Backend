import { Model, Schema } from 'mongoose';
import { getMongooseConnection } from '../../../../src/search/db/search-connection';

export const REQUEST_LOG_COLLECTION = 'request_logs';
export const REQUEST_LOG_MODEL = 'RequestLog';


const RETENTION_SECONDS = 30 * 24 * 60 * 60;

export interface RequestLogEntry {
  method: string;
  path: string;
  query?: Record<string, string>;
  route?: string;
  statusCode: number;
  durationMs: number;
  aborted: boolean;
  responseBytes?: number;
  user?: { id?: string; role?: string };
  userAgent?: string;
  origin?: string;
  runtime: {
    nodeEnv?: string;
    vercelEnv?: string;
    region?: string;
    deploymentId?: string;
    commit?: string;
  };
  createdAt?: Date;
}

export const RequestLogSchema = new Schema<RequestLogEntry>(
  {
    method: { type: String, required: true },
    path: { type: String, required: true },
    query: Schema.Types.Mixed,
    route: String,
    statusCode: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    aborted: { type: Boolean, required: true },
    responseBytes: Number,
    user: new Schema({ id: String, role: String }, { _id: false }),
    userAgent: String,
    origin: String,
    runtime: new Schema(
      { nodeEnv: String, vercelEnv: String, region: String, deploymentId: String, commit: String },
      { _id: false },
    ),
  },
  {
    collection: REQUEST_LOG_COLLECTION,
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

RequestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
RequestLogSchema.index({ route: 1, createdAt: -1 });

export async function getRequestLogModel(): Promise<Model<RequestLogEntry>> {
  const connection = await getMongooseConnection();
  return (
    connection.models[REQUEST_LOG_MODEL] ?? connection.model<RequestLogEntry>(REQUEST_LOG_MODEL, RequestLogSchema)
  );
}
