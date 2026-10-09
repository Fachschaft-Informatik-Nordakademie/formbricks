-- FSINF: consent-based device fingerprint audit for link surveys (see ZSurveyFsinfFingerprint)
ALTER TABLE "Survey" ADD COLUMN     "fsinfFingerprint" JSONB DEFAULT '{"enabled": false}';
