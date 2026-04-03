// NIP-88 Poll tag builder (Kind 1068)

// Build poll tags from options and poll type
// options: [{ id, label }]
// pollType: "singlechoice" | "multiplechoice"
export function buildPollTags(options, pollType = "singlechoice") {
  const tags = [];

  for (const opt of options) {
    tags.push(["option", String(opt.id), opt.label]);
  }

  tags.push(["polltype", pollType]);

  return tags;
}
