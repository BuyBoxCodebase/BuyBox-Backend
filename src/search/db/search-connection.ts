import * as dns from 'dns';
import * as mongoose from 'mongoose';
import { Connection } from 'mongoose';
import { registerSearchModels, SearchModels } from './search-models';

// One Mongoose connection per running process.
//
// A database connection is an open socket inside this process, so it can't be shared through Redis.
// On Vercel, a warm function instance keeps this module loaded between requests, so later
// requests reuse the connection and only a cold start pays for connecting.
//
// M0 allows 500 connections in total and every function instance opens its own pool,
// so the pool is kept small.
const POOL_SIZE = 5;

let connecting: Promise<SearchModels> | null = null;

export function getSearchModels(): Promise<SearchModels> {
  if (!connecting) {
    connecting = connect().catch((error) => {
      connecting = null; // let the next request try again
      throw error;
    });
  }
  return connecting;
}

async function connect(): Promise<SearchModels> {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error('DATABASE_URL is not set');

  // A mongodb+srv:// address needs a DNS SRV lookup. Some machines point Node at a local resolver that
  // refuses those ("querySrv ECONNREFUSED"); DNS_SERVERS=1.1.1.1,8.8.8.8 makes Node ask those servers instead.
  if (process.env.DNS_SERVERS) {
    const servers = process.env.DNS_SERVERS.split(',').map((server) => server.trim());
    dns.setServers(servers);
    dns.promises.setServers(servers); // the driver uses the promise API, which has its own resolver
  }

  const connection: Connection = await mongoose
    .createConnection(uri, {
      maxPoolSize: POOL_SIZE,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      maxIdleTimeMS: 60_000,
    })
    .asPromise();

  return registerSearchModels(connection);
}
