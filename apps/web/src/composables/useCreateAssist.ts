import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { getCreateAssistFlow, type CreateAssistFlow, type CreateAssistFlowId } from "../constants/createAssist";
import { focusAssistField } from "../utils/createAssistEvents";
import { inferActiveStep, interpretCreatePhrase, type AssistInterpretation } from "../utils/createAssistEngine";

export interface UseCreateAssistOptions {
  flowId: CreateAssistFlowId;
  context: Ref<Record<string, unknown>> | ComputedRef<Record<string, unknown>>;
  onFocusField?: (field: string) => void;
}

export function useCreateAssist(options: UseCreateAssistOptions) {
  const phrase = ref("");
  const interpretation = ref<AssistInterpretation | null>(null);
  const manualStep = ref<number | null>(null);

  const flow = computed<CreateAssistFlow>(() => getCreateAssistFlow(options.flowId));

  const activeStep = computed(() => {
    if (manualStep.value != null) return manualStep.value;
    const ctx = options.context.value ?? {};
    return inferActiveStep(options.flowId, ctx);
  });

  watch(
    options.context,
    () => {
      const ctx = options.context.value ?? {};
      if (manualStep.value != null && manualStep.value < inferActiveStep(options.flowId, ctx)) {
        manualStep.value = null;
      }
    },
    { deep: true },
  );

  function focusField(field: string): void {
    options.onFocusField?.(field);
    focusAssistField(field);
    const el = document.querySelector<HTMLElement>(`[data-assist-field="${field}"]`);
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function goToStep(index: number, field?: string): void {
    manualStep.value = index;
    if (field) focusField(field);
  }

  function interpret(): void {
    const result = interpretCreatePhrase(phrase.value, options.flowId, options.context.value ?? {});
    interpretation.value = result;
    if (result?.field) {
      manualStep.value = result.stepIndex;
      focusField(result.field);
    } else if (result) {
      manualStep.value = result.stepIndex;
    }
  }

  function useExample(ex: string): void {
    phrase.value = ex;
    interpret();
  }

  function reset(): void {
    phrase.value = "";
    interpretation.value = null;
    manualStep.value = null;
  }

  return {
    flow,
    phrase,
    interpretation,
    activeStep,
    goToStep,
    interpret,
    useExample,
    reset,
  };
}
