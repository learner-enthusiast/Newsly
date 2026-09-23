export {
  NEWS_PIPELINE_EVENT,
  newsPipelineEventDataSchema,
  newsPipelineFunction,
  type NewsPipelineEventData,
} from "./newsPipeline";

import { newsPipelineFunction } from "./newsPipeline";

export const inngestFunctions = [newsPipelineFunction];
