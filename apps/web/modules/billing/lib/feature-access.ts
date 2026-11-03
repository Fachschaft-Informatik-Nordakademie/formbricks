import "server-only";

/**
 * FSINF CE: Stripe-plan entitlements only exist on Formbricks Cloud, which this AGPL-only build does
 * not support (the cloud billing/license code lived in `modules/ee`). Every caller asks only when
 * IS_FORMBRICKS_CLOUD is set; if it ever is, nothing is entitled rather than everything.
 */
export const hasCloudEntitlement = async (_organizationId: string, _featureLookupKey: string) => false;

export const hasCloudEntitlementWithLicenseGuard = async (
  _organizationId: string,
  _featureLookupKey: string
): Promise<boolean> => false;
