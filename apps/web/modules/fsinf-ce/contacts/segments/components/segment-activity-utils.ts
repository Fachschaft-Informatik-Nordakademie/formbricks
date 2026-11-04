/**
 * FSINF CE: survey names that use a segment, as shown in the segment edit/delete dialogs.
 */
import type { TSegmentWithSurveyRefs } from "@formbricks/types/segment";

export interface TSegmentActivitySummary {
  activeSurveys: string[];
  inactiveSurveys: string[];
}

export const getSegmentActivitySummary = (
  segment: Pick<TSegmentWithSurveyRefs, "activeSurveys" | "inactiveSurveys">
): TSegmentActivitySummary => ({
  activeSurveys: segment.activeSurveys.map((survey) => survey.name),
  inactiveSurveys: segment.inactiveSurveys.map((survey) => survey.name),
});
