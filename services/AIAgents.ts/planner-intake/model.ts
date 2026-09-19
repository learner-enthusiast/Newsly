/** Small, fast model for intake extraction and visit-date parsing. */
export function plannerIntakeModel() {
  return (
    process.env.PLANNER_INTAKE_MODEL ??
    process.env.OPENAI_INTAKE_MODEL ??
    "gpt-4o-mini"
  );
}
