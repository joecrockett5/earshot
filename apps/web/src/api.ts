import type {
  ApiError,
  ClipInfo,
  CreateSoundInput,
  HealthInfo,
  Scene,
  SoundSummary,
  UpdateSoundInput,
} from '@earshot/shared';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiRequestError('Cannot reach the Earshot server', 0);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as ApiError;
      if (body.error)
        message = body.details?.length ? `${body.error}: ${body.details[0]}` : body.error;
    } catch {
      // Keep the generic message when the body is not JSON.
    }
    throw new ApiRequestError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function json(method: string, body: unknown, extra?: RequestInit): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...extra,
  };
}

export const api = {
  health: () => request<HealthInfo>('/health'),
  listSounds: () => request<SoundSummary[]>('/sounds'),
  getSound: (id: string) => request<Scene>(`/sounds/${id}`),
  createSound: (input: CreateSoundInput = {}) => request<Scene>('/sounds', json('POST', input)),
  saveSound: (id: string, input: UpdateSoundInput, keepalive = false) =>
    request<Scene>(`/sounds/${id}`, json('PUT', input, { keepalive })),
  deleteSound: (id: string) => request<void>(`/sounds/${id}`, { method: 'DELETE' }),
  duplicateSound: (id: string) => request<Scene>(`/sounds/${id}/duplicate`, { method: 'POST' }),
  uploadClip: (file: Blob) => {
    const form = new FormData();
    // The server ignores the filename; the format is detected from the bytes.
    form.append('file', file, 'clip');
    return request<ClipInfo>('/clips', { method: 'POST', body: form });
  },
  clipUrl: (id: string) => `/api/clips/${id}`,
};
