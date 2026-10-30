/** A locally sourced DCP snapshot, independent of physical film parameters. */
export interface CameraProfile {
  version: 1; name: string; camera: string; description: string; copyright: string;
  tags: Record<string, number[]>;
}
export interface CameraCurveConfiguration {
  profile?: CameraProfile;
  message?: string;
}
