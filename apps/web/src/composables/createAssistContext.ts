import type { ComputedRef, InjectionKey, Ref } from "vue";
import type { CreateAssistFlow } from "../constants/createAssist";
import type { AssistInterpretation } from "../utils/createAssistEngine";

export interface CreateAssistContext {
  flow: ComputedRef<CreateAssistFlow>;
  activeStep: ComputedRef<number>;
  phrase: Ref<string>;
  interpretation: Ref<AssistInterpretation | null>;
  goToStep: (index: number, field?: string) => void;
  interpret: () => void;
  useExample: (ex: string) => void;
  reset: () => void;
}

export const CREATE_ASSIST_KEY: InjectionKey<CreateAssistContext> = Symbol("createAssist");
