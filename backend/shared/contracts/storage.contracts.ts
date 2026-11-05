/**
 * Message patterns and error codes of the storage microservice. Callers import
 * this file so pattern names and payload shapes cannot drift from the
 * implementation.
 *
 * The service is presigned-URL based: clients ask for an upload URL, PUT the
 * bytes straight to MinIO, confirm, and receive temporary download URLs.
 */
export const STORAGE_PATTERNS = {
  /** Reserves a key and returns a temporary presigned upload URL. */
  getUploadUrl: 'storage.upload-url',
  /** Verifies an uploaded object and returns its metadata. */
  confirmUpload: 'storage.confirm-upload',
  /** Returns a temporary presigned download URL. */
  getDownloadUrl: 'storage.download-url',
  /** Deletes an object. */
  deleteObject: 'storage.delete',
} as const;

/** Key namespaces: one folder per kind of object, all inside one bucket. */
export const STORAGE_NAMESPACES = {
  /** Employee profile pictures. */
  avatar: 'avatars',
  /** Check-in proof photos. */
  proof: 'proofs',
} as const;

export type StorageNamespace =
  (typeof STORAGE_NAMESPACES)[keyof typeof STORAGE_NAMESPACES];

/** The shape every key the service hands out follows. */
export const STORAGE_KEY =
  /^(avatars|proofs)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|pdf)$/;

export interface UploadUrlRequest {
  contentType: string;
  /** Optional; when present its extension must agree with `contentType`. */
  fileName?: string;
  /** Defaults to `avatars` for callers that predate the proofs namespace. */
  namespace?: StorageNamespace;
}

/** Error codes carried by the storage service's RpcException payloads. */
export const STORAGE_ERRORS = {
  invalidArgument: 'INVALID_ARGUMENT',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  notFound: 'NOT_FOUND',
  unavailable: 'STORAGE_UNAVAILABLE',
} as const;

export interface UploadUrlResult {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface ConfirmedUpload {
  key: string;
  size: number;
  contentType: string | null;
}

export interface DownloadUrlResult {
  key: string;
  downloadUrl: string;
  expiresInSeconds: number;
  contentType: string | null;
  size: number;
}

export interface DeletedObject {
  key: string;
  deleted: true;
}
