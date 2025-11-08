// Reorder both top-level and sections keys in one call
export function reorderPayload(obj) {
  let reordered = obj;
  if (obj.sections && typeof obj.sections === 'object') {
    reordered = { ...obj, sections: reorderSections(obj.sections) };
  }
  return reorderTopLevel(reordered);
}
// Desired order for top-level keys in the payload
export const topLevelOrder = [
  'applicationId',
  'formType',
  'metadata',
  'sections'
];

export function reorderTopLevel(obj) {
  const ordered = {};
  for (const key of topLevelOrder) {
    if (obj.hasOwnProperty(key)) {
      ordered[key] = obj[key];
    }
  }

  for (const key of Object.keys(obj)) {
    if (!ordered.hasOwnProperty(key)) {
      ordered[key] = obj[key];
    }
  }
  return ordered;
}

export const desiredOrder = [
  'networkOperator',
  'projectOverview',
  'planDocuments',
  'assetInformation',
  'route',
  'worksOverview',
  'sensitiveAreaChecks',
  'sensitiveAreaReview',
  'sensitiveAreaReviewDocuments',
  'parishes',
  'supportingQuestions',
  'supportingDocuments',
  'eiaFees'
];

export function reorderSections(sections) {
  const ordered = {};
  for (const key of desiredOrder) {
    if (sections.hasOwnProperty(key)) {
      ordered[key] = sections[key];
    }
  }
  // Optionally add any extra keys not in desiredOrder
  for (const key of Object.keys(sections)) {
    if (!ordered.hasOwnProperty(key)) {
      ordered[key] = sections[key];
    }
  }
  return ordered;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function backoffSeconds(attempt) {
  // Exponential (30s, 60s, 120s, ...), cap at 6h
  return Math.min(Math.pow(2, Math.max(0, attempt - 1)) * 30, 6 * 60 * 60);
}

export function cutoffNowPlus(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function safeJsonParse(x) {
  if (!x) return null;
  try {
    return typeof x === "string" ? JSON.parse(x) : x;
  } catch {
    return null;
  }
}
