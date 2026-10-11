/** Minimal surface of mp4box 0.5.x used by `hooks/useVideoScrub.ts`. */
declare module "mp4box" {
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number;
  }

  export interface MP4VideoTrack {
    id: number;
    codec: string;
    timescale: number;
    duration: number;
    nb_samples: number;
    video: { width: number; height: number };
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    videoTracks: MP4VideoTrack[];
  }

  export interface MP4Sample {
    is_sync: boolean;
    cts: number;
    duration: number;
    timescale: number;
    data: Uint8Array;
  }

  export interface MP4Box {
    type: string;
    write(stream: DataStream): void;
  }

  export interface MP4Trak {
    mdia: {
      minf: {
        stbl: {
          stsd: {
            entries: Array<{
              avcC?: MP4Box;
              hvcC?: MP4Box;
              vpcC?: MP4Box;
              av1C?: MP4Box;
            }>;
          };
        };
      };
    };
  }

  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onError?: (error: string) => void;
    onSamples?: (id: number, user: unknown, samples: MP4Sample[]) => void;
    appendBuffer(data: MP4ArrayBuffer): number;
    flush(): void;
    start(): void;
    stop(): void;
    getTrackById(id: number): MP4Trak;
    setExtractionOptions(
      id: number,
      user?: unknown,
      options?: { nbSamples?: number },
    ): void;
  }

  export class DataStream {
    static BIG_ENDIAN: boolean;
    constructor(
      arrayBuffer?: ArrayBuffer,
      byteOffset?: number,
      endianness?: boolean,
    );
    buffer: ArrayBuffer;
  }

  export function createFile(): MP4File;
}
