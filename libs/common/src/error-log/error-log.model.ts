import { Model, Schema } from 'mongoose';
import { getMongooseConnection } from '../../../../src/search/db/search-connection';

export const ERROR_LOG_COLLECTION = 'error_logs';
export const ERROR_LOG_MODEL = 'ErrorLog';

export type ErrorSource = 'http' | 'background' | 'process' | 'startup';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: unknown;
  details?: unknown;
}

export interface ErrorLogEntry {
  source: ErrorSource;
  context?: string;
  statusCode?: number;
  handled: boolean;
  error: SerializedError;
  causes: SerializedError[];
  request?: {
    method?: string;
    url?: string;
    route?: string;
    params?: unknown;
    query?: unknown;
    body?: unknown;
    ip?: string;
    userAgent?: string;
    origin?: string;
    referer?: string;
  };
  user?: { id?: string; role?: string; email?: string };
  extra?: unknown;
  runtime: {
    nodeEnv?: string;
    vercelEnv?: string;
    region?: string;
    deploymentId?: string;
    commit?: string;
  };
  createdAt?: Date;
}

const serializedErrorSchema = new Schema<SerializedError>(
  {
    name: String,
    message: String,
    stack: String,
    code: Schema.Types.Mixed,
    details: Schema.Types.Mixed,
  },
  { _id: false },
);

const requestSchema = new Schema<ErrorLogEntry['request']>(
  {
    method: String,
    url: String,
    route: String,
    params: Schema.Types.Mixed,
    query: Schema.Types.Mixed,
    body: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    origin: String,
    referer: String,
  },
  { _id: false },
);

const userSchema = new Schema<ErrorLogEntry['user']>(
  { id: String, role: String, email: String },
  { _id: false },
);

const runtimeSchema = new Schema<ErrorLogEntry['runtime']>(
  { nodeEnv: String, vercelEnv: String, region: String, deploymentId: String, commit: String },
  { _id: false },
);

export const ErrorLogSchema = new Schema<ErrorLogEntry>(
  {
    source: { type: String, required: true, enum: ['http', 'background', 'process', 'startup'] },
    context: String,
    statusCode: Number,
    handled: { type: Boolean, required: true },
    error: serializedErrorSchema,
    causes: [serializedErrorSchema],
    request: requestSchema,
    user: userSchema,
    extra: Schema.Types.Mixed,
    runtime: runtimeSchema,
  },
  {
    collection: ERROR_LOG_COLLECTION,
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

ErrorLogSchema.index({ createdAt: -1 });

export async function getErrorLogModel(): Promise<Model<ErrorLogEntry>> {
  const connection = await getMongooseConnection();
  return connection.models[ERROR_LOG_MODEL] ?? connection.model<ErrorLogEntry>(ERROR_LOG_MODEL, ErrorLogSchema);
}
