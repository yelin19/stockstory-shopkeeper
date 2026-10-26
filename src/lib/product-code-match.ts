export type ProductCodeMatch<T> =
  | { kind: "matched"; product: T; distance: number }
  | { kind: "ambiguous"; candidates: T[] }
  | { kind: "none" };

function editDistance(left: string, right: string) {
  const a = Array.from(left.normalize("NFC").toLocaleLowerCase());
  const b = Array.from(right.normalize("NFC").toLocaleLowerCase());
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length]!;
}

export function matchProductCode<T extends { code: string }>(
  input: string,
  products: readonly T[],
): ProductCodeMatch<T> {
  const normalizedInput = input.trim().normalize("NFC").toLocaleLowerCase();
  if (!normalizedInput) return { kind: "none" };

  const closeMatches = products.flatMap((product) => {
    const distance = editDistance(normalizedInput, product.code);
    if (distance === 0) return [{ product, distance }];
    if (
      distance === 1 &&
      // The product's own code must be long enough for a one-character
      // correction to be safe; the typed text may be one char short or long.
      Array.from(product.code.normalize("NFC")).length >= 4
    ) {
      return [{ product, distance }];
    }
    return [];
  });

  if (!closeMatches.length) return { kind: "none" };
  const bestDistance = Math.min(...closeMatches.map((candidate) => candidate.distance));
  const bestMatches = closeMatches
    .filter((candidate) => candidate.distance === bestDistance)
    .sort((a, b) => a.product.code.localeCompare(b.product.code));

  if (bestMatches.length > 1)
    return { kind: "ambiguous", candidates: bestMatches.map((candidate) => candidate.product) };
  return { kind: "matched", product: bestMatches[0]!.product, distance: bestDistance };
}
