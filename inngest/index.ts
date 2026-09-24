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
} from "./newsNewchatPipeline";

export {
  RESEARCH_SOURCE_INDEX_EVENT,
  researchSourceIndexEventDataSchema,
  researchSourceDescriptionFunction,
  enqueueResearchSourceIndexing,
  type ResearchSourceIndexEventData,
} from "./researchSourceDescriptionPipeline";

import { chatPipelineFunction } from "./newsNewchatPipeline";
import { newsPipelineFunction } from "./newsPipeline";
import { researchSourceDescriptionFunction } from "./researchSourceDescriptionPipeline";

export const inngestFunctions = [
  newsPipelineFunction,
  chatPipelineFunction,
  researchSourceDescriptionFunction,
];
