export {
  NEWS_PIPELINE_EVENT,
  newsPipelineEventDataSchema,
  newsPipelineFunction,
  type NewsPipelineEventData,
} from "./newsPipeline";

export {
  CHAT_PIPELINE_EVENT,
  chatPipelineEventDataSchema,
  chatPipelineFunction,
  type ChatPipelineEventData,
} from "./chatPipeline";

import { chatPipelineFunction } from "./chatPipeline";
import { newsPipelineFunction } from "./newsPipeline";

export const inngestFunctions = [newsPipelineFunction, chatPipelineFunction];
