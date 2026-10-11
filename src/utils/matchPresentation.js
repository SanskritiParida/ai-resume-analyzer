// Coalesce repeated subjects for display with the conservative classification.
export function isSkillRequirement(item) {
  const groups = [
    ["node.js", "nodejs"],
    ["postgresql", "postgres"],
    ["javascript", "js"],
    ["typescript", "ts"],
    ["react", "react.js", "reactjs"],
    ["express", "express.js"],
  ];
  const canonical = (value) => {
    const lower = value.toLowerCase();
    return groups.find((group) => group.includes(lower))?.[0] || lower;
  };
  return (
    item.kind === "skill" ||
    (item.kind === "experience" &&
      item.support.some(
        (f) =>
          (f.field === "technologies" ||
            (f.section === "skills" && f.field === "name")) &&
          canonical(f.value) === canonical(item.subject),
      ))
  );
}
export function skillMatchGroups(requirements) {
  const bySubject = new Map();
  const rank = { NOT_EVIDENCED: 0, PARTIAL: 1, MATCHED: 2 };
  for (const item of requirements.filter(isSkillRequirement)) {
    const key = item.subject.toLowerCase();
    const previous = bySubject.get(key);
    if (!previous) bySubject.set(key, item);
    else
      bySubject.set(key, {
        ...previous,
        importance:
          previous.importance === "required" || item.importance === "required"
            ? "required"
            : "preferred",
        classification:
          rank[item.classification] < rank[previous.classification]
            ? item.classification
            : previous.classification,
        requirement: [previous.requirement, item.requirement].join("\n"),
        reason: [previous.reason, item.reason].join(" "),
        support: [
          ...new Map(
            [...previous.support, ...item.support].map((f) => [f.id, f]),
          ).values(),
        ],
      });
  }
  const items = [...bySubject.values()].sort(
    (a, b) =>
      (a.importance === "required" ? 0 : 1) -
      (b.importance === "required" ? 0 : 1),
  );
  return {
    matched: items.filter((r) => r.classification === "MATCHED"),
    notEvidenced: items.filter((r) => r.classification !== "MATCHED"),
    requiredCount: items.filter((r) => r.importance === "required").length,
    matchedRequiredCount: items.filter(
      (r) => r.importance === "required" && r.classification === "MATCHED",
    ).length,
    partialRequiredCount: items.filter(
      (r) => r.importance === "required" && r.classification === "PARTIAL",
    ).length,
  };
}
