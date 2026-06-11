export const MEDIA_KEY_COMMANDS = [
  { value: "volumeup", label: "Volume up", group: "volume" },
  { value: "volumedown", label: "Volume down", group: "volume" },
  { value: "volumemute", label: "Mute", group: "volume" },
  { value: "playpause", label: "Play / pause", group: "transport" },
  { value: "nexttrack", label: "Next track", group: "transport" },
  { value: "prevtrack", label: "Previous track", group: "transport" },
];

export const MACRO_ACTION_TYPES = [
  { value: "none", label: "None" },
  { value: "media", label: "Media & volume key" },
  { value: "notify", label: "Desktop notify" },
  { value: "log", label: "Console log" },
  { value: "screenshot", label: "Screenshot" },
  { value: "script", label: "Run script" },
];

export const EMPTY_MACRO_BINDING = {
  nickname: "",
  actionType: "none",
  mediaKey: "playpause",
};

export function mediaKeyLabel(mediaKey) {
  const cmd = MEDIA_KEY_COMMANDS.find((c) => c.value === mediaKey);
  return cmd?.label ?? mediaKey ?? "";
}

/** Human-readable action label for display in the inspector summary. */
export function macroActionLabel(binding) {
  if (!binding || binding.actionType === "none") return "None";
  if (binding.actionType === "media") {
    return mediaKeyLabel(binding.mediaKey);
  }
  const opt = MACRO_ACTION_TYPES.find((o) => o.value === binding.actionType);
  return opt?.label ?? binding.actionType;
}

/** User-facing macro label: nickname if set, otherwise the action/media label. */
export function macroDisplayName(binding) {
  if (!binding) return "";
  const nick = binding.nickname?.trim();
  if (nick) return nick;
  if (binding.actionType === "media" && binding.mediaKey) {
    return mediaKeyLabel(binding.mediaKey);
  }
  const opt = MACRO_ACTION_TYPES.find((o) => o.value === binding.actionType);
  return opt?.label ?? binding.actionType ?? "";
}
