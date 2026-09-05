export enum CacheTag {
  CATEGORIES = 'categories',
  SUBCATEGORY_PRODUCTS = 'subcategory-products',
}

export enum FrontendApp {
  CUSTOMER_WEB = 'CUSTOMER_WEB_URL',
  SELLER_WEB = 'SELLER_WEB_URL',
  ADMIN_WEB = 'ADMIN_WEB_URL'
}

export const revalidateFrontendCache = (app: FrontendApp, tag: CacheTag, maxRetries = 1) => {
  try {
    const appUrl = process.env[app];
    const secret = process.env.REVALIDATION_SECRET;
    
    if (!appUrl) {
      console.warn(`Cannot revalidate cache: Environment variable ${app} is not set.`);
      return;
    }

    const attemptRevalidation = async (retriesLeft: number) => {
      try {
        const response = await fetch(`${appUrl}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, secret })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        if (retriesLeft > 0) {
          console.warn(`Failed to revalidate Next.js cache for tag ${tag} on ${app}. Retrying... (${retriesLeft} attempts left)`);
          // 1 second delay before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          await attemptRevalidation(retriesLeft - 1);
        } else {
          console.error(`Failed to revalidate Next.js cache for tag ${tag} on ${app} after all retries (async error)`, error);
        }
      }
    };

    // fire and forget
    attemptRevalidation(maxRetries);
  } catch (error) {
    console.error(`Failed to initiate revalidation for tag ${tag} on ${app}`, error);
  }
};
