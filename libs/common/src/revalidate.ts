import { logError } from './error-log/log-error';

export enum CacheTag {
  CATEGORIES = 'categories',
  SUBCATEGORY_PRODUCTS = 'subcategory-products',
}

export enum FrontendApp {
  CUSTOMER_WEB = 'CUSTOMER_WEB_URL',
  SELLER_WEB = 'SELLER_WEB_URL',
  ADMIN_WEB = 'ADMIN_WEB_URL'
}

export const revalidateFrontendCache = async (app: FrontendApp, tag: CacheTag, maxRetries = 1): Promise<void> => {
  const appUrl = process.env[app];
  const secret = process.env.REVALIDATION_SECRET;

  if (!appUrl) {
    console.warn(`Cannot revalidate cache: Environment variable ${app} is not set.`);
    return;
  }

  for (let retriesLeft = maxRetries; ; retriesLeft--) {
    try {
      const response = await fetch(`${appUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, secret })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return;
    } catch (error) {
      if (retriesLeft > 0) {
        console.warn(`Failed to revalidate Next.js cache for tag ${tag} on ${app}. Retrying... (${retriesLeft} attempts left)`);
        // 1 second delay before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      await logError(error, {
        context: 'revalidateFrontendCache',
        extra: { app, tag, appUrl, attempts: maxRetries + 1 },
      });
      return;
    }
  }
};
