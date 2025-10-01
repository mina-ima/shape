import cv from "@techstark/opencv-js";

export function calculateHuMoments(
  cvInstance: typeof cv,
  contour: cv.Mat,
): number[] {
  const moments = cvInstance.moments(contour);
  const huMoments = new cvInstance.Mat();
  cvInstance.HuMoments(moments, huMoments);

  const huMomentsArray: number[] = [];
  for (let i = 0; i < huMoments.rows; i++) {
    huMomentsArray.push(huMoments.data64F[i]);
  }

  huMoments.delete();
  return huMomentsArray;
}

export function calculateEFD(
  cvInstance: typeof cv,
  contour: cv.Mat,
  numHarmonics: number,
): number[] {
  // This is a simplified implementation of Elliptic Fourier Descriptors (EFD).
  // A more robust implementation would involve more complex calculations.
  // For now, we'll compute the DFT of the contour's (x,y) coordinates.

  const points = contour.data32S;
  const N = points.length / 2; // Number of points in the contour

  if (N < 2) {
    return Array(numHarmonics * 4).fill(0); // Not enough points for EFD
  }

  const deltaT = 1 / N;

  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const d: number[] = [];

  for (let n = 1; n <= numHarmonics; n++) {
    let An = 0;
    let Bn = 0;
    let Cn = 0;
    let Dn = 0;

    for (let i = 0; i < N; i++) {
      const x_i = points[i * 2];
      const y_i = points[i * 2 + 1];
      const x_i_plus_1 = points[((i + 1) % N) * 2];
      const y_i_plus_1 = points[((i + 1) % N) * 2 + 1];

      const deltaX = x_i_plus_1 - x_i;
      const deltaY = y_i_plus_1 - y_i;

      const t_i = i * deltaT;
      const t_i_plus_1 = (i + 1) * deltaT;

      const term1 =
        (Math.cos(2 * Math.PI * n * t_i_plus_1) -
          Math.cos(2 * Math.PI * n * t_i)) /
        (2 * Math.PI * n);
      const term2 =
        (Math.sin(2 * Math.PI * n * t_i_plus_1) -
          Math.sin(2 * Math.PI * n * t_i)) /
        (2 * Math.PI * n);

      An += deltaX * term1;
      Bn += deltaX * term2;
      Cn += deltaY * term1;
      Dn += deltaY * term2;
    }

    a.push(An);
    b.push(Bn);
    c.push(Cn);
    d.push(Dn);
  }

  // Normalize EFD coefficients (e.g., by A1 and phase shift)
  // This is a basic normalization. More advanced methods exist.
  const A1 = a[0];
  const B1 = b[0];

  const L0 = Math.sqrt(A1 * A1 + B1 * B1);
  const theta = Math.atan2(A1, B1);

  const normalizedEFD: number[] = [];
  for (let n = 0; n < numHarmonics; n++) {
    const An_prime =
      (a[n] * Math.cos(n * theta) + b[n] * Math.sin(n * theta)) / L0;
    const Bn_prime =
      (-a[n] * Math.sin(n * theta) + b[n] * Math.cos(n * theta)) / L0;
    const Cn_prime =
      (c[n] * Math.cos(n * theta) + d[n] * Math.sin(n * theta)) / L0;
    const Dn_prime =
      (-c[n] * Math.sin(n * theta) + d[n] * Math.cos(n * theta)) / L0;
    normalizedEFD.push(An_prime, Bn_prime, Cn_prime, Dn_prime);
  }

  return normalizedEFD;
}
