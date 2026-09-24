declare module "fpcalc" {
  interface FpcalcResult {
    fingerprint: string;
    duration: number;
  }

  function fpcalc(filePath: string): Promise<FpcalcResult>;
  export default fpcalc;
}
