export function normalizeVector(values: ArrayLike<number>): Float32Array {
  const vector = Float32Array.from(values);
  let sumSquares = 0;

  for (const value of vector) {
    sumSquares += value * value;
  }

  if (!sumSquares) {
    return vector;
  }

  const magnitude = Math.sqrt(sumSquares);
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] /= magnitude;
  }

  return vector;
}

export function cosineSimilarity(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): number {
  if (left.length !== right.length) {
    throw new Error('Embedding vectors must have the same length.');
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
