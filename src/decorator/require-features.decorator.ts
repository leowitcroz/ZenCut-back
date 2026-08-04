import { SetMetadata } from '@nestjs/common';
import { SaasFeature } from '../auth/saas-features.enum';

export const REQUIRE_FEATURES_KEY = 'require_features';
export const RequireFeatures = (...features: SaasFeature[]) => SetMetadata(REQUIRE_FEATURES_KEY, features);