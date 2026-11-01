/** Exact, case-insensitive identity matching shared by the catalog and its UI. */
export function isUserAssignee(
  assignee: string | undefined,
  name: string,
  aliases: string,
): boolean {
  const normalized = assignee?.trim().toLocaleLowerCase('de-DE');
  return (
    !!normalized &&
    [name, ...aliases.split(',')]
      .map((value) => value.trim().toLocaleLowerCase('de-DE'))
      .filter(Boolean)
      .includes(normalized)
  );
}
