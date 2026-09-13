import { onMounted, onUnmounted } from "vue";
import type { CreateAssistFlowId } from "../constants/createAssist";
import { FFA_ASSIST_FOCUS_FIELD, FFA_START_CREATE_ASSIST } from "./createAssistEvents";

export function useCreateAssistListener(
  flowId: CreateAssistFlowId,
  onStart: () => void,
  onFocusField?: (field: string) => void,
): void {
  function onAssistStart(ev: Event): void {
    const detail = (ev as CustomEvent<{ flowId: CreateAssistFlowId }>).detail;
    if (detail?.flowId !== flowId) return;
    onStart();
  }

  function onFocus(ev: Event): void {
    const detail = (ev as CustomEvent<{ field: string }>).detail;
    if (!detail?.field || !onFocusField) return;
    onFocusField(detail.field);
  }

  onMounted(() => {
    window.addEventListener(FFA_START_CREATE_ASSIST, onAssistStart);
    if (onFocusField) window.addEventListener(FFA_ASSIST_FOCUS_FIELD, onFocus);
  });

  onUnmounted(() => {
    window.removeEventListener(FFA_START_CREATE_ASSIST, onAssistStart);
    if (onFocusField) window.removeEventListener(FFA_ASSIST_FOCUS_FIELD, onFocus);
  });
}
