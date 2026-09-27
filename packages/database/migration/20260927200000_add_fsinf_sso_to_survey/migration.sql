-- FSINF: respondent SSO gate for link surveys (see ZSurveyFsinfSso)
ALTER TABLE "Survey" ADD COLUMN     "fsinfSso" JSONB DEFAULT '{"enabled": false}';
