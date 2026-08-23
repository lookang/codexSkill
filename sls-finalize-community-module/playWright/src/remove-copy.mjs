export function copyBaseTitle(title) {
  const normalized = cleanTitle(title);
  const match = /^(.*?)(?: - Copy)+$/i.exec(normalized);
  return match?.[1]?.trim() || null;
}

export function planCopyRemoval(activities = []) {
  const items = activities.map((activity, index) => ({
    ...(typeof activity === "string" ? { title: activity } : activity),
    index: Number.isInteger(activity?.index) ? activity.index : index,
    title: cleanTitle(typeof activity === "string" ? activity : activity?.title),
  }));
  const candidates = [];
  const skipped = [];
  const copies = items.filter((activity) => copyBaseTitle(activity.title));
  const clean = items.filter((activity) => !copyBaseTitle(activity.title));

  for (const activity of copies) {
    const baseTitle = copyBaseTitle(activity.title);
    const exactCopies = copies.filter((entry) => sameTitle(entry.title, activity.title));
    const sameBaseCopies = copies.filter((entry) => sameTitle(copyBaseTitle(entry.title), baseTitle));
    const cleanMatches = clean.filter((entry) => sameTitle(entry.title, baseTitle));
    const planned = { ...activity, baseTitle };

    if (exactCopies.length !== 1) {
      skipped.push({
        ...planned,
        reason: `${exactCopies.length} activities share this exact copy title`,
      });
    } else if (sameBaseCopies.length > 1) {
      skipped.push({
        ...planned,
        reason: `${sameBaseCopies.length} copy titles would all become "${baseTitle}"`,
      });
    } else if (cleanMatches.length > 0) {
      skipped.push({
        ...planned,
        reason: `the clean title "${baseTitle}" already exists`,
      });
    } else {
      candidates.push(planned);
    }
  }

  return {
    candidates,
    skipped,
    ignoredCount: clean.length,
    activityCount: items.length,
  };
}

function cleanTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sameTitle(left, right) {
  return cleanTitle(left).toLocaleLowerCase() === cleanTitle(right).toLocaleLowerCase();
}
