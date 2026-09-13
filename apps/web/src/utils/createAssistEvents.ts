import type { CreateAssistFlowId } from "../constants/createAssist";

export const FFA_START_CREATE_ASSIST = "ffa-start-create-assist";
export const FFA_ASSIST_FOCUS_FIELD = "ffa-assist-focus-field";

export function startCreateAssist(flowId: CreateAssistFlowId): void {
  window.dispatchEvent(new CustomEvent(FFA_START_CREATE_ASSIST, { detail: { flowId } }));
}

export function focusAssistField(field: string): void {
  window.dispatchEvent(new CustomEvent(FFA_ASSIST_FOCUS_FIELD, { detail: { field } }));
}
