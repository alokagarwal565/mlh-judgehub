/**
 * Formats a project array into a team range string like "#1 – #5" or "5 projects"
 * ponytail: Pure regex extractor, works on both JudgeSetProject and direct Project objects
 */
export function getSetRange(projects) {
  if (!projects || projects.length === 0) return '';
  const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const firstProject = sorted[0]?.project || sorted[0];
  const lastProject = sorted[sorted.length - 1]?.project || sorted[sorted.length - 1];

  const firstMatch = String(firstProject?.teamNumber || firstProject?.title || '').match(/\d+/);
  const lastMatch = String(lastProject?.teamNumber || lastProject?.title || '').match(/\d+/);

  if (firstMatch && lastMatch) {
    const start = parseInt(firstMatch[0], 10);
    const end = parseInt(lastMatch[0], 10);
    if (start === end) return `#${start}`;
    return `#${start} – #${end}`;
  }
  if (firstMatch) {
    const start = parseInt(firstMatch[0], 10);
    const end = start + sorted.length - 1;
    return `#${start} – #${end}`;
  }
  return `${sorted.length} projects`;
}
